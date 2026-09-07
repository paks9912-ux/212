import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBudget, detectLang, dedupKey, normalize } from '../src/pipeline/normalize.ts';

const rates = { USD: 1, EUR: 1.08, RUB: 0.011 };

test('бюджет: доллары в разных записях', () => {
  assert.deepEqual(parseBudget('Budget $450, fixed'), { min: 450, max: null, currency: 'USD' });
  assert.deepEqual(parseBudget('платим 300$ за лендинг'), { min: 300, max: null, currency: 'USD' });
  assert.deepEqual(parseBudget('от $300 до $500'), { min: 300, max: 500, currency: 'USD' });
  assert.equal(parseBudget('1.5k USD for the MVP').min, 1500);
});
test('бюджет: рубли и тысячи', () => {
  assert.deepEqual(parseBudget('Бюджет 20 000 руб'), { min: 20000, max: null, currency: 'RUB' });
  assert.equal(parseBudget('до 15к рублей').min, 15000);
  assert.equal(parseBudget('до 15к рублей').currency, 'RUB');
});
test('бюджет: голые числа не считаются деньгами', () => {
  assert.equal(parseBudget('12 pages, 3 forms, deliver in 7 days').min, null);
});
test('язык', () => {
  assert.equal(detectLang('Нужен лендинг для стоматологии, срочно'), 'ru');
  assert.equal(detectLang('Need a landing page for a dental clinic'), 'en');
  assert.equal(detectLang('1234 !!! ???'), 'other');
});
test('ключ дедупликации не зависит от порядка слов', () => {
  assert.equal(dedupKey('Landing page for dental clinic', ''), dedupKey('Dental clinic landing page', ''));
  assert.notEqual(dedupKey('Landing page for dental clinic', ''), dedupKey('Telegram bot for pizza', ''));
});
test('нормализация считает бюджет в долларах и платформу', () => {
  const o = normalize({ source: 'manual', externalId: 'x', url: 'https://www.upwork.com/jobs/~01abc', title: 'Fix site', text: 'Fix my site, budget €200, mobile layout broken', postedAt: null }, rates);
  assert.equal(o.platform, 'upwork');
  assert.equal(o.currency, 'EUR');
  assert.equal(o.budgetUsd, 216);
  assert.equal(o.lang, 'en');
  assert.equal(o.id.length, 12);
});
