/* Проверки расчётов: node fuel/tests/calc.test.js */
const fs = require('fs');
global.window = global;
const load = f => eval(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'));

global.localStorage = { getItem: () => null, setItem: () => { } };
load('util.js'); load('store.js'); load('calc.js');
DB.data = DB.empty();

let ok = 0, bad = 0;
const eq = (name, a, b, tol) => {
  tol = tol == null ? 0.01 : tol;
  if (a != null && Math.abs(a - b) <= tol) { ok++; console.log('  ✓', name); }
  else { bad++; console.log('  ✗', name, '— получено', a, ', ожидалось', b); }
};
const is = (name, c) => { if (c) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };
const t = U.today(), D = n => U.addDays(t, n);

/* каждый тест начинается с чистой базы */
function reset() {
  DB.data = DB.empty();
  CALC.clearCache();
}
function unit(p) {
  return DB.addUnit(Object.assign({ name: 'Тест', kind: 'truck', meter: 'km', fuel: 'dt', norm: 38, tank: 400 }, p));
}
function fill(u, day, liters, meter, extra) {
  return DB.addFill(Object.assign({
    unitId: u.id, date: D(day), liters: liters, meter: meter,
    price: 12000, fuel: u.fuel, source: 'tank', full: true
  }, extra || {}));
}

console.log('Расход от полной до полной, самосвал (норма 38 л/100 км):');
reset();
let u = unit({});
fill(u, -20, 200, 100000);
fill(u, -10, 190, 100500);
let r = CALC.unit(u);
eq('один сегмент', r.segments.length, 1);
eq('наработка 500 км', r.segments[0].run, 500);
eq('расход 38 л/100 км', r.segments[0].rate, 38);
eq('средний расход тот же', r.avg, 38);
eq('отклонение от нормы 0%', r.dev, 0);
eq('перерасхода нет', r.extraLiters, 0);
is('первая заправка сегмент не образует', CALC.segments(u)[0].from.meter === 100000);

console.log('Частичная заправка внутри сегмента приплюсовывается:');
reset();
u = unit({});
fill(u, -20, 200, 100000);
fill(u, -15, 50, 100200, { full: false });
fill(u, -10, 140, 100500);
r = CALC.unit(u);
eq('сегмент по-прежнему один', r.segments.length, 1);
eq('литров в сегменте 190', r.segments[0].liters, 190);
eq('расход 38 л/100 км', r.segments[0].rate, 38);

console.log('Перерасход: 200 л вместо нормативных 190:');
reset();
u = unit({});
fill(u, -20, 200, 100000);
fill(u, -10, 200, 100500);
r = CALC.unit(u);
eq('расход 40 л/100 км', r.avg, 40);
eq('лишних 10 литров', r.extraLiters, 10);
eq('в деньгах 120 000', r.extraCost, 120000);
eq('отклонение +5,26%', r.dev, 5.263, 0.01);
is('сигнал о перерасходе не выдан — порог 10%', !r.alerts.filter(a => a.type === 'overrun').length);

reset();
u = unit({});
fill(u, -20, 200, 100000);
fill(u, -10, 230, 100500);
r = CALC.unit(u);
is('расход выше порога — сигнал есть', !!r.alerts.filter(a => a.type === 'overrun').length);

console.log('Моточасы: экскаватор, норма 14 л/мч:');
reset();
u = unit({ kind: 'excavator', meter: 'mh', norm: 14, tank: 340 });
fill(u, -20, 300, 4000);
fill(u, -10, 1400, 4100);
r = CALC.unit(u);
eq('расход 14 л/мч', r.avg, 14);
eq('норма выполнена', r.dev, 0);

console.log('Средний расход — по последним пяти сегментам, взвешенно:');
reset();
u = unit({});
fill(u, -60, 200, 100000);
[[-50, 190, 100500], [-40, 190, 101000], [-30, 190, 101500], [-20, 190, 102000], [-10, 190, 102500], [-5, 300, 103000]]
  .forEach(x => fill(u, x[0], x[1], x[2]));
r = CALC.unit(u);
eq('шесть сегментов', r.segments.length, 6);
eq('средний по последним пяти', r.avg, (190 * 4 + 300) / 2500 * 100, 0.01);
eq('последний участок 60 л/100 км', r.lastRate, 60);

console.log('Странные записи:');
reset();
u = unit({ tank: 400 });
fill(u, -20, 200, 100000);
let f = fill(u, -10, 430, 100500);
is('залито больше бака — замечено', !!CALC.fillFlags(u, f).filter(x => x.type === 'over-tank').length);
reset();
u = unit({});
fill(u, -20, 200, 100000);
f = fill(u, -10, 200, 99800);
is('счётчик поехал назад — замечено', !!CALC.fillFlags(u, f).filter(x => x.type === 'meter-back').length);
is('расход по такому участку не считается', CALC.segments(u)[0].rate === null);
reset();
u = unit({});
fill(u, -20, 200, 100000);
f = fill(u, -10, 200, 100000);
is('заправка без наработки — замечено', !!CALC.fillFlags(u, f).filter(x => x.type === 'no-run').length);

console.log('Наработка в день и ТО по счётчику:');
reset();
u = unit({ kind: 'excavator', meter: 'mh', norm: 14, service: { every: 250, lastMeter: 4000, lastDate: D(-30) } });
fill(u, -20, 300, 4000);
fill(u, -10, 1400, 4100);
r = CALC.unit(u);
eq('10 моточасов в день', r.perDay, 10);
eq('с последнего ТО прошло 100', r.service.since, 100);
eq('до ТО осталось 150', r.service.left, 150);
eq('это примерно 15 дней', r.service.days, 15);
is('до ТО ещё далеко', !r.service.due && !r.service.soon);
reset();
u = unit({ kind: 'excavator', meter: 'mh', norm: 14, service: { every: 250, lastMeter: 4000, lastDate: D(-30) } });
fill(u, -20, 300, 4200);
fill(u, -10, 1400, 4260);
r = CALC.unit(u);
is('ТО просрочено', CALC.unit(u).service.due);
is('и попало в сигналы', !!r.alerts.filter(a => a.type === 'service').length);

console.log('Бочка: приход, выдача, остаток:');
reset();
u = unit({});
DB.addSupply({ date: D(-30), fuel: 'dt', liters: 1000, price: 12000 });
fill(u, -20, 200, 100000);
fill(u, -10, 100, 100500);
fill(u, -5, 100, 100700, { source: 'station' });
let tk = CALC.tank('dt');
eq('в бочку залито 1000 л', tk.gotTotal, 1000);
eq('из бочки выдано 300 л', tk.usedTotal, 300);
eq('остаток 700 л', tk.balance, 700);
is('заправка на АЗС бочку не трогает', tk.fills.length === 2);

console.log('Замер остатка и недостача:');
reset();
u = unit({});
DB.addSupply({ date: D(-30), fuel: 'dt', liters: 1000, price: 12000 });
fill(u, -20, 300, 100000);
DB.addCheck({ date: D(-15), fuel: 'dt', liters: 650 });
tk = CALC.tank('dt');
eq('по учёту должно быть 700', tk.diff.expected, 700);
eq('недостача 50 л', tk.diff.delta, -50);
eq('остаток берётся от замера', tk.balance, 650);
DB.addSupply({ date: D(-10), fuel: 'dt', liters: 200, price: 12000 });
fill(u, -5, 50, 100500);
CALC.clearCache();
tk = CALC.tank('dt');
eq('после замера: 650 + 200 − 50', tk.balance, 800);

console.log('Сводка за месяц:');
reset();
u = unit({});
const mk = U.monthKey(t);
DB.addFill({ unitId: u.id, date: t, liters: 100, price: 12000, cost: 1200000, meter: 100000, fuel: 'dt', source: 'tank', full: true });
DB.addFill({ unitId: u.id, date: t, liters: 50, price: 12000, cost: 600000, meter: 100300, fuel: 'dt', source: 'station', full: true });
let m = CALC.month(mk);
eq('литров за месяц', m.liters, 150);
eq('денег за месяц', m.cost, 1800000);
eq('из них с АЗС', m.station, 50);
eq('из них из бочки', m.tank, 100);

console.log('Демонстрационный набор:');
reset();
DB.data = DB.demo();
CALC.clearCache();
is('техника заведена', DB.units().length === 5);
is('заправки есть', DB.fills().length > 40);
const fleet = CALC.fleet();
is('нашёлся перерасход', fleet.overrun >= 1);
is('есть сигналы', fleet.alerts.length > 0);
const t2 = CALC.tank('dt');
is('в бочке положительный остаток', t2.balance > 0);
is('недостача по замеру видна', t2.diff && t2.diff.delta < 0);
is('отчёт текстом собирается', CALC.report(U.monthKey(t)).indexOf('Топливо') === 0);

console.log('');
console.log(bad ? '✗ провалено: ' + bad + ', пройдено: ' + ok : '✓ все проверки пройдены: ' + ok);
process.exit(bad ? 1 : 0);
