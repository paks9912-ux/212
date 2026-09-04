/* Проверки расчётов: node credit/tests/calc.test.js */
const fs = require('fs');
global.window = global;
const load = f => eval(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'));

global.DB = { data: { settings: { currency: 'UZS', rates: {} } } };
load('util.js'); load('fx.js'); load('calc.js');
DB.save = function () { CALC.clearCache(); };

let ok = 0, bad = 0;
const eq = (name, a, b, tol) => {
  tol = tol || 0.01;
  if (Math.abs(a - b) <= tol) { ok++; console.log('  ✓', name); }
  else { bad++; console.log('  ✗', name, '— получено', a, ', ожидалось', b); }
};
const is = (name, c) => { if (c) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };
const t = U.today();
const D = n => U.addDays(t, n);
const M = n => U.addMonths(t, n);

console.log('Проценты на остаток, 100 000 под 10%/мес, прошло 2 месяца:');
const L1 = { id: '1', principal: 100000, issuedAt: M(-2), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: M(1), payments: [], status: 'active', penaltyRate: 0 };
let r = CALC.at(L1, t);
eq('начислено 20 000', r.interestAccrued, 20000);
eq('к возврату 120 000', r.totalDue, 120000);
eq('за день набегает 10% / длину месяца', r.dailyAccrual, 100000 * 0.1 / U.diffDays(t, M(1)), 0.01);

console.log('Частичный платёж 30 000 через месяц после выдачи:');
const L2 = JSON.parse(JSON.stringify(L1));
L2.id = '2';
L2.payments = [{ id: 'p1', date: M(-1), amount: 30000 }];
r = CALC.at(L2, t);
eq('проценты уплачены 10 000', r.paidInterest, 10000);
eq('тело погашено 20 000', r.paidPrincipal, 20000);
eq('за 2-й месяц на остаток 80 000 → 8 000', r.interestDue, 8000);
eq('всего к возврату 88 000', r.totalDue, 88000);

console.log('Просрочка 10 дней, пеня 1%/день:');
const L3 = { id: '3', principal: 50000, issuedAt: M(-1), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: D(-10), penaltyRate: 1, payments: [], status: 'active' };
r = CALC.at(L3, t);
eq('дней просрочки 10', r.overdueDays, 10);
eq('пеня 5 000', r.penaltyDue, 5000);
eq('за ровно месяц начислено 5 000', r.interestAccrued, 5000);
const L3b = { id: '3b', principal: 50000, issuedAt: M(-2), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: M(-1), penaltyRate: 0, payments: [], status: 'active', stopAccrual: true };
eq('со стоп-начислением — ровно за один месяц 5 000', CALC.at(L3b, t).interestAccrued, 5000);

console.log('Фиксированная сумма возврата 100 000 → 130 000:');
r = CALC.at({ id: '4', principal: 100000, returnAmount: 130000, issuedAt: D(-5), model: 'fixed', dueAt: D(25), payments: [], status: 'active', penaltyRate: 0 }, t);
eq('к возврату 130 000', r.totalDue, 130000);
eq('заложено прибыли 30 000', r.interestDue, 30000);

console.log('Полное погашение закрывает долг:');
r = CALC.at({ id: '5', principal: 10000, issuedAt: M(-1), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: t, payments: [{ id: 'x', date: t, amount: 11000 }], status: 'active', penaltyRate: 0 }, t);
eq('остаток 0', r.rawDue, 0);
eq('прибыль 1 000', r.profit, 1000);

console.log('Переплата не уходит в минус:');
r = CALC.at({ id: '7', principal: 1000, issuedAt: t, model: 'simple', rate: 0, ratePeriod: 'month', dueAt: t, payments: [{ id: 'y', date: t, amount: 5000 }], status: 'active', penaltyRate: 0 }, t);
eq('долг 0', r.rawDue, 0);
eq('переплата 4 000', r.overpay, 4000);

console.log('Даты:');
is('31 января + 1 месяц = 28 февраля', U.addMonths('2026-01-31', 1) === '2026-02-28');
eq('через високосный февраль', U.diffDays('2024-02-28', '2024-03-01'), 2);

/* ======== ежемесячная выплата процентов ======== */
console.log('\nГрафик: 100 000 под 10%/мес, выдан 3 месяца назад, проценты ежемесячно:');
const S1 = {
  id: 's1', principal: 100000, issuedAt: M(-3), model: 'simple', rate: 10, ratePeriod: 'month',
  payMode: 'monthly', dueAt: M(9), penaltyRate: 0, status: 'active', payments: [], currency: 'UZS'
};
let sch = CALC.schedule(S1, t);
is('построено 12 месячных платежей', sch.length === 12);
eq('первый платёж ровно 10 000', sch[0].due, 10000);
is('первая дата = месяц после выдачи', sch[0].date === U.addMonths(S1.issuedAt, 1));
is('3 просроченных периода', sch.filter(p => p.status === 'overdue').length === 3);
let st = CALC.loan(S1);
is('заём помечен просроченным из-за пропусков', st.isOverdue === true);
is('пропущено 3', st.missed === 3);
is('ближайший платёж — первый непогашенный', st.nextPay && st.nextPay.n === 1);

console.log('Тот же заём, проценты платились вовремя:');
const S2 = JSON.parse(JSON.stringify(S1));
S2.id = 's2';
S2.payments = [1, 2, 3].map(i => ({ id: 'm' + i, date: U.addMonths(S2.issuedAt, i), amount: 10000 }));
DB.save();
st = CALC.loan(S2);
is('просрочки нет', st.isOverdue === false);
is('пропусков нет', st.missed === 0);
eq('тело не тронуто — 100 000', st.balance, 100000);
eq('получено процентов 30 000', st.profit, 30000);
is('следующий платёж — 4-й месяц', st.nextPay && st.nextPay.n === 4);
eq('долг сегодня ≈ только набежавшие проценты', st.totalDue - st.balance, st.interestDue, 0.01);

console.log('Бессрочный заём (срок не указан):');
const S3 = { id: 's3', principal: 200000, issuedAt: M(-2), model: 'simple', rate: 5, ratePeriod: 'month', payMode: 'monthly', dueAt: null, penaltyRate: 0, status: 'active', payments: [], currency: 'UZS' };
sch = CALC.schedule(S3, t);
is('график строится и без даты возврата', sch.length >= 4);
eq('месячный платёж ровно 10 000', sch[0].due, 10000);
is('два месяца пропущено', sch.filter(p => p.status === 'overdue').length === 2);

console.log('Ставка из суммы:');
eq('15 000 с 100 000 = 15%', CALC.rateFromAmount(100000, 15000), 15);
eq('обратно: 15% от 100 000 = 15 000', CALC.amountFromRate(100000, 15), 15000);

/* ======== валюты ======== */
console.log('\nВалюты и курсы:');
DB.data.settings.rates = { USD: 1, UZS: 12500, KGS: 89 };
eq('100 $ → 1 250 000 сум', FX.conv(100, 'USD', 'UZS'), 1250000);
eq('8 900 сом → 100 $', FX.conv(8900, 'KGS', 'USD'), 100);
is('перевод возможен', FX.can('KGS', 'UZS') === true);
DB.data.settings.rates = {};
is('без курса перевод невозможен', FX.conv(100, 'USD', 'UZS') === null);
is('внутри одной валюты работает всегда', FX.conv(100, 'UZS', 'UZS') === 100);

console.log('Портфель из двух валют:');
const A = { id: 'a', principal: 1000000, issuedAt: M(-1), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: M(1), payments: [], status: 'active', penaltyRate: 0, currency: 'UZS', payMode: 'end' };
const B = { id: 'b', principal: 1000, issuedAt: M(-1), model: 'simple', rate: 10, ratePeriod: 'month', dueAt: M(1), payments: [], status: 'active', penaltyRate: 0, currency: 'USD', payMode: 'end' };
DB.save();
let P = CALC.portfolio([A, B]);
is('без курса итог не сводится', P.totalDue === null && P.mixed === true);
eq('по сумам 1 100 000', P.cur.totalDue.UZS, 1100000);
eq('по долларам 1 100', P.cur.totalDue.USD, 1100);
DB.data.settings.rates = { USD: 1, UZS: 12500 };
DB.save();
P = CALC.portfolio([A, B]);
eq('с курсом итог 1 100 000 + 13 750 000 сум', P.totalDue, 1100000 + 1100 * 12500);
is('смешения больше нет', P.mixed === false);

console.log('\nИтог: ' + ok + ' пройдено, ' + bad + ' провалено');
process.exit(bad ? 1 : 0);
