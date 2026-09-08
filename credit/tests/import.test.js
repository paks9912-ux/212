/* Загрузка и выгрузка таблиц: node credit/tests/import.test.js */
const fs = require('fs');
global.window = global;
const load = f => eval(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'));
global.localStorage = { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = v; } };
load('util.js');
global.DB = { data: null };
load('fx.js'); load('store.js'); load('calc.js');
DB.data = DB.empty();

let ok = 0, bad = 0;
const is = (n, c) => { if (c) { ok++; console.log('  ✓', n); } else { bad++; console.log('  ✗', n); } };
const eq = (n, a, b) => is(n + ' = ' + a, Math.abs(a - b) < 0.01);

/* ---------- простая таблица ---------- */
console.log('Простая таблица (имя, телефон, сумма, дата, ставка, период, срок):');
DB.data = DB.empty();
let n = DB.importCSV(
  'Имя;Телефон;Сумма;Дата выдачи;Ставка;Период;Срок;Заметка\n' +
  'Сергей Волков;+79001112233;120000;01.08.2026;12;месяц;60;под залог авто\n' +
  'Нина Белова;+79005556677;45000;15.08.2026;5;неделя;;\n' +
  'Сергей Волков;;60000;20.08.2026;10;месяц;30;второй заём');
is('загружено 3 займа', n === 3);
is('клиентов 2 — одинаковые имена объединены', DB.clients().length === 2);
is('дата 01.08.2026 разобрана', DB.loans()[0].issuedAt === '2026-08-01');
is('срок 60 дней посчитан', DB.loans()[0].dueAt === '2026-09-30');
is('ставка 5% в неделю', DB.loans()[1].rate === 5 && DB.loans()[1].ratePeriod === 'week');
is('без срока в таблице → без срока в займе', DB.loans()[1].dueAt === null);

/* ---------- собственная выгрузка приложения ---------- */
console.log('\nСобственная выгрузка приложения загружается обратно:');
DB.data = DB.empty();
DB.data.settings.currency = 'USD';
const exported =
  '"Клиент";"Телефон";"Сумма";"Валюта";"Дата выдачи";"Ставка";"Период";"Проценты";"Вернуть до";"Выплачено";"Остаток долга";"Статус"\n' +
  '"Пётр";"+998901112233";"6500";"USD";"2026-06-19";"4.6";"в месяц";"ежемесячно";"без срока";"0";"7291";"просрочка"\n' +
  '"Анна";"+996700100500";"12000000";"сум";"2026-08-10";"5";"в месяц";"ежемесячно";"2026-11-10";"1200000";"11400000";"активен"\n' +
  '"Олег";"";"3000";"USD";"2026-01-10";"7";"в месяц";"в конце срока";"2026-04-10";"3630";"0";"закрыт"';
n = DB.importCSV(exported);
is('загружено 3 займа', n === 3);
const [p, a, o] = DB.loans();
is('валюта доллара распознана', p.currency === 'USD');
eq('дробная ставка 4,6% сохранена', p.rate, 4.6);
is('дата выдачи не спутана с валютой', p.issuedAt === '2026-06-19');
is('«без срока» → срока нет', p.dueAt === null);
is('режим «ежемесячно»', p.payMode === 'monthly');
is('символ «сум» превращён в код UZS', a.currency === 'UZS');
is('дата возврата прочитана', a.dueAt === '2026-11-10');
is('выплаченное перенесено платежом', a.payments.length === 1 && a.payments[0].amount === 1200000);
is('режим «в конце срока»', o.payMode === 'end');
is('закрытый заём остался закрытым', o.status === 'closed');
is('клиент без телефона не сломал строку', DB.client(o.clientId).name === 'Олег');

/* ---------- выгрузка → загрузка → те же цифры ---------- */
console.log('\nКруг «выгрузил → загрузил» не теряет суммы:');
const before = CALC.portfolio(DB.loans());
const csv2 = DB.exportCSV();
DB.data = DB.empty();
DB.data.settings.currency = 'USD';
DB.importCSV(csv2.replace(/^﻿/, ''));
const after = CALC.portfolio(DB.loans());
is('число займов совпало', DB.loans().length === 3);
eq('выдано всего', after.cur.issued.USD || 0, before.cur.issued.USD || 0);
eq('остаток долга в долларах', Math.round(after.cur.totalDue.USD || 0), Math.round(before.cur.totalDue.USD || 0));

/* ---------- резервная копия ---------- */
console.log('\nРезервная копия восстанавливается полностью:');
const json = DB.exportJSON();
DB.data = DB.empty();
DB.importJSON(json, 'replace');
is('клиенты на месте', DB.clients().length === 3);
is('займы на месте', DB.loans().length === 3);
is('платежи внутри займов сохранились', DB.loans().some(l => (l.payments || []).length));

console.log('\nИтог: ' + ok + ' пройдено, ' + bad + ' провалено');
process.exit(bad ? 1 : 0);
