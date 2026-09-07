/* Проверка окружения перед первым запуском: ключи, конфиг, сеть до каждого источника.
   Ничего не меняет, только говорит, что не так и как починить. */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, ROOT } from './config.js';

type Item = { ok: boolean | null; name: string; note: string };
const items: Item[] = [];
const add = (ok: boolean | null, name: string, note = '') => items.push({ ok, name, note });

async function probe(url: string, init: RequestInit = {}, okStatuses = [200]): Promise<{ ok: boolean; note: string }> {
  try {
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'freelance-pipeline/doctor', ...(init.headers || {}) } });
    return okStatuses.includes(r.status) ? { ok: true, note: `HTTP ${r.status}` } : { ok: false, note: `HTTP ${r.status}` };
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    return { ok: false, note: /403|CONNECT/.test(m) ? 'сеть закрыта прокси' : /timeout|Timeout/.test(m) ? 'нет ответа за 12 с' : m.slice(0, 80) };
  }
}

export async function doctor(): Promise<boolean> {
  /* окружение */
  const [maj, min] = process.versions.node.split('.').map(Number);
  add(maj > 22 || (maj === 22 && min >= 12), `Node ${process.versions.node}`, maj < 22 ? 'нужен 22.12 или новее — встроенный SQLite' : '');
  add(fs.existsSync(path.join(ROOT, '.env')), 'файл .env', 'cp .env.example .env и заполните');

  let cfg;
  try { cfg = loadConfig(true); add(true, 'config/*.yml читаются'); }
  catch (e) { add(false, 'config/*.yml', e instanceof Error ? e.message : String(e)); return print(); }

  const p = cfg.profile;
  add(p.target_hourly_usd !== 40 || p.name !== '', 'профиль заполнен', p.target_hourly_usd === 40 && p.name === '' ? 'в config/profile.yml всё ещё предположения: цель $40 и пустое имя' : '');
  add(cfg.cases.length > 0 && !cfg.cases.every(c => /пример/i.test(c.title)), 'кейсы в config/cases', 'пока только пример — отклики будут общими');

  /* ключи */
  add(!!cfg.env.anthropicKey, 'ANTHROPIC_API_KEY', 'без него не будет ни оценки, ни откликов');
  add(!!cfg.env.botToken && !!cfg.env.adminChatId, 'TELEGRAM_BOT_TOKEN и TELEGRAM_ADMIN_CHAT_ID', 'нужны для алертов; токен у @BotFather, chat id у @userinfobot');

  /* сеть: Claude и Telegram */
  if (cfg.env.anthropicKey) {
    const r = await probe('https://api.anthropic.com/v1/models', { headers: { 'x-api-key': cfg.env.anthropicKey, 'anthropic-version': '2023-06-01' } });
    add(r.ok, 'Claude API отвечает', r.ok ? r.note : r.note === 'HTTP 401' ? 'ключ не принят' : r.note);
  }
  if (cfg.env.botToken) {
    const r = await probe(`https://api.telegram.org/bot${cfg.env.botToken}/getMe`);
    add(r.ok, 'Telegram Bot API отвечает', r.ok ? r.note : r.note === 'HTTP 401' ? 'токен не принят' : r.note);
  }

  /* сеть: источники */
  const s = cfg.sources;
  if (s.hn.enabled) { const r = await probe('https://hn.algolia.com/api/v1/search?query=test&hitsPerPage=1'); add(r.ok, 'источник HN (Algolia)', r.note); }
  if (s.reddit.enabled) { const r = await probe(`https://www.reddit.com/r/${s.reddit.subreddits[0]}/new/.rss?limit=1`); add(r.ok, `источник Reddit r/${s.reddit.subreddits[0]}`, r.ok ? r.note : r.note + ' — Reddit иногда режет облачные IP; с домашней сети обычно работает'); }
  if (s.freelancer.enabled) {
    const r = await probe('https://www.freelancer.com/api/projects/0.1/projects/active/?limit=1&compact=true', cfg.env.freelancerToken ? { headers: { 'freelancer-oauth-v1': cfg.env.freelancerToken } } : {});
    add(r.ok, 'источник Freelancer.com', r.note);
  } else add(null, 'источник Freelancer.com', 'выключен в config/sources.yml');
  if (s.telegram.enabled) {
    add(!!cfg.env.tgApiId && !!cfg.env.tgApiHash, 'TG_API_ID и TG_API_HASH', 'с https://my.telegram.org');
    add(!!cfg.env.tgSession, 'TG_SESSION', 'npm run tg:login и вставьте строку в .env');
    add(s.telegram.channels.length > 0, 'список Telegram-каналов', 'пустой — добавьте 5–10 каналов с заказами в config/sources.yml');
  } else add(null, 'источник Telegram', 'выключен в config/sources.yml');

  /* база и папки */
  try { fs.mkdirSync(path.dirname(cfg.env.dbPath), { recursive: true }); fs.accessSync(path.dirname(cfg.env.dbPath), fs.constants.W_OK); add(true, `база ${path.relative(ROOT, cfg.env.dbPath)}`); }
  catch { add(false, 'папка для базы', 'нет прав на запись в ' + path.dirname(cfg.env.dbPath)); }

  return print();
}

function print(): boolean {
  let bad = 0;
  for (const i of items) {
    const mark = i.ok === null ? '·' : i.ok ? '✓' : '✗';
    if (i.ok === false) bad++;
    console.log(`${mark} ${i.name}${i.note ? '  — ' + i.note : ''}`);
  }
  console.log(bad ? `\n${bad} ${bad === 1 ? 'проблема' : 'проблем'}. Исправьте и запустите npm run doctor снова.` : '\nВсё на месте. Дальше: npm run run');
  return bad === 0;
}
