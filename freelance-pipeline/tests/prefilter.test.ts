import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../src/config.ts';
import { prefilter, matchServices } from '../src/pipeline/prefilter.ts';
import { normalize } from '../src/pipeline/normalize.ts';

const cfg = loadConfig();
const mk = (text: string, extra: Partial<Parameters<typeof normalize>[0]> = {}) =>
  normalize({ source: 'hn', externalId: Math.random().toString(36), url: null, title: text.slice(0, 60), text, postedAt: new Date().toISOString(), ...extra }, cfg.filters.usd_rates);

test('проходит нормальный заказ по вашей теме', () => {
  const r = prefilter(mk('Need a landing page for a dental clinic, mobile-first, from a Figma reference. Budget $450.'), cfg);
  assert.equal(r.pass, true);
  assert.ok(r.matchedServices.includes('landing'));
});
test('стоп-фразы отсеиваются', () => {
  const r = prefilter(mk('Landing page needed, revenue share only, no budget upfront, big opportunity for the right person'), cfg);
  assert.equal(r.pass, false);
  assert.match(r.reason!, /стоп-фраза/);
});
test('бюджет ниже минимума отсеивается, почасовой — нет', () => {
  assert.equal(prefilter(mk('Fix the html layout of my landing page, $40 budget, quick job please'), cfg).pass, false);
  assert.equal(prefilter(mk('Fix the html layout of my landing page, $40/hour, ongoing work expected', { budgetType: 'hourly' }), cfg).pass, true);
});
test('не ваша тема — отсеивается', () => {
  const r = prefilter(mk('Looking for a voice actor to record a 30-second commercial in Spanish, budget $200'), cfg);
  assert.equal(r.pass, false);
  assert.equal(r.reason, 'не про ваши услуги');
});
test('слишком старое — отсеивается', () => {
  const r = prefilter(mk('Need a telegram bot for my shop, budget $300', { postedAt: new Date(Date.now() - 80 * 3.6e6).toISOString() }), cfg);
  assert.equal(r.pass, false);
  assert.match(r.reason!, /старше/);
});
test('много откликов — отсеивается', () => {
  assert.equal(prefilter(mk('Need a telegram bot for my shop, budget $300', { proposals: 90 }), cfg).pass, false);
});
test('сопоставление услуг по русским ключам', () => {
  assert.deepEqual(matchServices('нужен лендинг и адаптив под мобильные', cfg).sort(), ['landing', 'mobile']);
});
