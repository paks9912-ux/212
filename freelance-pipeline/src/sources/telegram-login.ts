/* Одноразовый вход: печатает строку сессии для TG_SESSION. Запуск: npm run tg:login */
import readline from 'node:readline/promises';
import { TelegramClient } from 'teleproto';
import { StringSession } from 'teleproto/sessions/index.js';
import { loadEnv } from '../config.js';

loadEnv();
const apiId = Number(process.env.TG_API_ID), apiHash = process.env.TG_API_HASH;
if (!apiId || !apiHash) { console.error('Заполните TG_API_ID и TG_API_HASH в .env (с https://my.telegram.org)'); process.exit(1); }

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const client = new TelegramClient(new StringSession(''), apiId, apiHash, { connectionRetries: 3 });
await client.start({
  phoneNumber: () => rl.question('Телефон (с кодом страны): '),
  password: () => rl.question('Пароль двухфакторной защиты (если есть): '),
  phoneCode: () => rl.question('Код из Telegram: '),
  onError: e => console.error(e),
});
console.log('\nСкопируйте строку в .env как TG_SESSION=\n');
console.log(client.session.save());
await client.disconnect();
rl.close();
