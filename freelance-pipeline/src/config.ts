/* Конфигурация: YAML из config/, секреты из .env. Ключи в лог не пишутся. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

/* .env без сторонних библиотек: KEY=VALUE, строки с # пропускаются */
export function loadEnv(file = path.join(ROOT, '.env')) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const Service = z.object({
  key: z.string(),
  name: z.string(),
  keywords: z.array(z.string()).min(1),
  typical_hours: z.tuple([z.number(), z.number()]),
  ai_leverage: z.number().min(0).max(1),
});

export const ProfileSchema = z.object({
  name: z.string().default(''),
  languages: z.array(z.enum(['ru', 'en'])).default(['ru', 'en']),
  target_hourly_usd: z.number().positive(),
  mode: z.enum(['money', 'reviews']).default('money'),
  max_hours_per_order: z.number().positive(),
  min_budget_usd: z.number().nonnegative(),
  sweet_budget_usd: z.tuple([z.number(), z.number()]),
  apply_overhead_hours: z.number().nonnegative().default(0.5),
  services: z.array(Service).min(1),
});

export const WeightsSchema = z.object({
  fit: z.number(), money: z.number(), ai_leverage: z.number(), client: z.number(),
  speed: z.number(), competition: z.number(), repeat: z.number(), risk_penalty: z.number(),
  reviews_mode_overrides: z.record(z.string(), z.number()).default({}),
  p_win_prior: z.record(z.string(), z.number()),
  fees: z.record(z.string(), z.number()),
  categories: z.object({
    hot_hourly_multiplier: z.number(), hot_min_p_win: z.number(), hot_max_age_minutes: z.number(),
    high_profit_min_budget: z.number(), quick_win_max_hours: z.number(),
    high_ai_min: z.number(), good_client_min: z.number(),
    show_min_score: z.number(), maybe_min_score: z.number(),
  }),
});

export const FiltersSchema = z.object({
  max_age_hours: z.number(),
  min_text_length: z.number(),
  max_proposals: z.number(),
  require_service_keyword: z.boolean(),
  stop_phrases: z.array(z.string()),
  usd_rates: z.record(z.string(), z.number()),
  max_alerts_per_hour: z.number().default(6),
});

export const SourcesSchema = z.object({
  poll_interval_minutes: z.number().default(5),
  hn: z.object({ enabled: z.boolean(), thread_query: z.string() }),
  reddit: z.object({ enabled: z.boolean(), subreddits: z.array(z.string()), title_must_match: z.string() }),
  telegram: z.object({ enabled: z.boolean(), channels: z.array(z.string()), messages_per_channel: z.number().default(40) }),
  freelancer: z.object({ enabled: z.boolean(), queries: z.array(z.string()), limit_per_query: z.number().default(30) }),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type Weights = z.infer<typeof WeightsSchema>;
export type Filters = z.infer<typeof FiltersSchema>;
export type Sources = z.infer<typeof SourcesSchema>;

export interface CaseFile {
  title: string; services: string[]; url?: string; budget_usd?: number; hours?: number; year?: number; body: string;
}

export interface Config {
  profile: Profile;
  weights: Weights;
  filters: Filters;
  sources: Sources;
  cases: CaseFile[];
  prompts: { score: string; proposal: string; reply: string; plan: string; deliver: string };
  calibration?: import('./calibrate/index.js').Calibration | null;
  models: { score: string; proposal: string; reply: string };
  env: {
    anthropicKey: string | undefined;
    botToken: string | undefined;
    adminChatId: string | undefined;
    tgApiId: number | undefined;
    tgApiHash: string | undefined;
    tgSession: string | undefined;
    freelancerToken: string | undefined;
    webHost: string; webPort: number; dbPath: string;
  };
}

function readYaml<S extends z.ZodType>(schema: S, file: string): z.output<S> {
  const raw = YAML.parse(fs.readFileSync(path.join(ROOT, 'config', file), 'utf8'));
  const r = schema.safeParse(raw);
  if (!r.success) throw new Error(`config/${file}: ${r.error.issues.map(i => i.path.join('.') + ' — ' + i.message).join('; ')}`);
  return r.data;
}

/* Кейсы: markdown с front-matter, простой разбор без библиотек */
export function loadCases(dir = path.join(ROOT, 'config', 'cases')): CaseFile[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'README.md').map(f => {
    const txt = fs.readFileSync(path.join(dir, f), 'utf8');
    const m = txt.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    const meta = m ? (YAML.parse(m[1]) as Record<string, unknown>) : {};
    return {
      title: String(meta.title ?? f),
      services: Array.isArray(meta.services) ? meta.services.map(String) : [],
      url: meta.url ? String(meta.url) : undefined,
      budget_usd: typeof meta.budget_usd === 'number' ? meta.budget_usd : undefined,
      hours: typeof meta.hours === 'number' ? meta.hours : undefined,
      year: typeof meta.year === 'number' ? meta.year : undefined,
      body: (m ? m[2] : txt).trim(),
    };
  });
}

let cached: Config | null = null;
export function loadConfig(force = false): Config {
  if (cached && !force) return cached;
  loadEnv();
  const prompts = (n: string) => fs.readFileSync(path.join(ROOT, 'prompts', n + '.md'), 'utf8');
  const cfg: Config = {
    profile: readYaml(ProfileSchema, 'profile.yml'),
    weights: readYaml(WeightsSchema, 'weights.yml'),
    filters: readYaml(FiltersSchema, 'filters.yml'),
    sources: readYaml(SourcesSchema, 'sources.yml'),
    cases: loadCases(),
    prompts: { score: prompts('score'), proposal: prompts('proposal'), reply: prompts('reply'), plan: prompts('plan'), deliver: prompts('deliver') },
    models: {
      /* Поток скоринга — дешёвая модель; тексты для клиента — сильная.
         Оба меняются через переменные окружения без правки кода. */
      score: process.env.MODEL_SCORE || 'claude-haiku-4-5',
      proposal: process.env.MODEL_PROPOSAL || 'claude-opus-5',
      reply: process.env.MODEL_REPLY || 'claude-opus-5',
    },
    env: {
      anthropicKey: process.env.ANTHROPIC_API_KEY || undefined,
      botToken: process.env.TELEGRAM_BOT_TOKEN || undefined,
      adminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID || undefined,
      tgApiId: process.env.TG_API_ID ? Number(process.env.TG_API_ID) : undefined,
      tgApiHash: process.env.TG_API_HASH || undefined,
      tgSession: process.env.TG_SESSION || undefined,
      freelancerToken: process.env.FREELANCER_TOKEN || undefined,
      webHost: process.env.WEB_HOST || '127.0.0.1',
      webPort: Number(process.env.WEB_PORT || 8787),
      dbPath: process.env.DB_PATH || path.join(ROOT, 'data', 'app.db'),
    },
  };
  cached = cfg;
  return cfg;
}
