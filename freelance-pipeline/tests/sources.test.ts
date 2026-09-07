import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { itemsFromThread } from '../src/sources/hn.ts';
import { parseAtom } from '../src/sources/reddit.ts';
import { itemsFromResponse } from '../src/sources/freelancer.ts';
import { itemFromMessage, looksLikeJob } from '../src/sources/telegram.ts';
import { itemFromInput } from '../src/sources/manual.ts';

const fx = (f: string) => fs.readFileSync(new URL('./fixtures/' + f, import.meta.url), 'utf8');

test('HN: берём только SEEKING FREELANCER', () => {
  const items = itemsFromThread(JSON.parse(fx('hn-thread.json')), '41000000');
  assert.equal(items.length, 2);
  assert.match(items[0].title, /Landing page for a dental clinic/);
  assert.match(items[0].text, /Budget \$450/);
  assert.equal(items[0].url, 'https://news.ycombinator.com/item?id=41000101');
  assert.equal(items[0].client?.name, 'dentalco');
});
test('Reddit: только [Hiring], html очищен', () => {
  const items = parseAtom(fx('reddit-forhire.xml'), 'forhire', /\[hiring\]|\[task\]/i);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Fix mobile layout on my Shopify landing page — $150');
  assert.match(items[0].text, /hero section breaks on iPhone/);
  assert.doesNotMatch(items[0].text, /<p>|submitted by/);
  assert.equal(items[0].externalId, 'abc123');
});
test('Freelancer: бюджет, отклики, клиент', () => {
  const items = itemsFromResponse(JSON.parse(fx('freelancer.json')));
  assert.equal(items.length, 1);
  const i = items[0];
  assert.equal(i.budgetMin, 750); assert.equal(i.budgetMax, 1500); assert.equal(i.currency, 'USD');
  assert.equal(i.proposals, 12);
  assert.equal(i.client?.verified, true); assert.equal(i.client?.country, 'Germany'); assert.equal(i.client?.reviews, 23);
  assert.deepEqual(i.skills, ['Website Design', 'HTML', 'CSS']);
  assert.match(i.url!, /freelancer\.com\/projects\/website-design/);
});
test('Telegram: сообщение → заказ, болтовня отсеивается', () => {
  const job = itemFromMessage('freelance_ru', { id: 77, message: '#заказ Нужен лендинг для кофейни, бюджет 25 000 руб, срок неделя. Писать в лс', date: 1757167200 });
  assert.ok(job); assert.equal(job!.url, 'https://t.me/freelance_ru/77'); assert.equal(job!.title, 'Нужен лендинг для кофейни, бюджет 25 000 руб, срок неделя. Писать в лс');
  assert.equal(looksLikeJob(job!.text), true);
  assert.equal(looksLikeJob('#резюме Верстальщик, 5 лет опыта, ищу заказы, портфолио в профиле'), false);
  assert.equal(itemFromMessage('c', { id: 1, message: 'ок' }), null);
});
test('ручная вставка: текст без ссылки', async () => {
  const i = await itemFromInput('Нужен телеграм-бот для записи клиентов в барбершоп, бюджет 300$', async () => { throw new Error('no net'); });
  assert.equal(i.source, 'manual'); assert.equal(i.url, null); assert.match(i.title, /телеграм-бот/);
});
test('ручная вставка: ссылка на закрытую страницу не ломает', async () => {
  const i = await itemFromInput('https://www.upwork.com/jobs/~01abc', async () => new Response('login required', { status: 403 }));
  assert.equal(i.url, 'https://www.upwork.com/jobs/~01abc'); assert.ok(i.text.length > 0);
});
