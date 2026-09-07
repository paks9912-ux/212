/* Этаж 1: правила без модели. Возвращает причину отсева — она хранится и пригодится для калибровки. */
import type { Opportunity } from '../types.js';
import type { Config } from '../config.js';

export interface FilterResult { pass: boolean; reason: string | null; matchedServices: string[] }

export function matchServices(text: string, cfg: Config): string[] {
  const t = text.toLowerCase();
  return cfg.profile.services.filter(s => s.keywords.some(k => t.includes(k.toLowerCase()))).map(s => s.key);
}

export function prefilter(o: Opportunity, cfg: Config, nowMs = Date.now()): FilterResult {
  const f = cfg.filters, p = cfg.profile;
  const blob = (o.title + '\n' + o.text);
  const matched = matchServices(blob, cfg);

  if (o.text.length < f.min_text_length) return { pass: false, reason: 'слишком короткое описание', matchedServices: matched };
  if (o.lang !== 'other' && !p.languages.includes(o.lang)) return { pass: false, reason: `язык ${o.lang} не в списке`, matchedServices: matched };
  if (o.lang === 'other') return { pass: false, reason: 'язык не распознан', matchedServices: matched };
  if (o.postedAt) {
    const ageH = (nowMs - Date.parse(o.postedAt)) / 3.6e6;
    if (ageH > f.max_age_hours) return { pass: false, reason: `старше ${f.max_age_hours} ч`, matchedServices: matched };
  }
  const low = blob.toLowerCase();
  const stop = f.stop_phrases.find(s => low.includes(s.toLowerCase()));
  if (stop) return { pass: false, reason: `стоп-фраза: «${stop}»`, matchedServices: matched };
  if (o.budgetUsd != null && o.budgetUsd < p.min_budget_usd && o.budgetType !== 'hourly') {
    return { pass: false, reason: `бюджет $${o.budgetUsd} ниже минимума $${p.min_budget_usd}`, matchedServices: matched };
  }
  if (o.proposals != null && o.proposals > f.max_proposals) return { pass: false, reason: `уже ${o.proposals} откликов`, matchedServices: matched };
  if (f.require_service_keyword && !matched.length) return { pass: false, reason: 'не про ваши услуги', matchedServices: matched };
  return { pass: true, reason: null, matchedServices: matched };
}
