/* Проверки расчётов: node fleet/tests/calc.test.js */
const fs = require('fs');
global.window = global;
const load = f => eval(fs.readFileSync(__dirname + '/../js/' + f, 'utf8'));

load('util.js');
load('store.js');
load('calc.js');

DB.data = DB.empty();
DB.save = function () { CALC.clearCache(); return true; };   // без localStorage

let ok = 0, bad = 0;
const eq = (name, a, b, tol) => {
  tol = tol == null ? 0.01 : tol;
  if (Math.abs(a - b) <= tol) { ok++; console.log('  ✓', name); }
  else { bad++; console.log('  ✗', name, '— получено', a, ', ожидалось', b); }
};
const is = (name, c) => { if (c) { ok++; console.log('  ✓', name); } else { bad++; console.log('  ✗', name); } };
const t = U.today();
const D = n => U.addDays(t, n);

const reset = () => { DB.data = DB.empty(); CALC.clearCache(); };

/* ---------------------------------------------------------------- */
console.log('\nНаработка смены:');
eq('по счётчику: 120 − 100 = 20', CALC.shiftWork({ start: 100, end: 120 }), 20);
eq('итогом, без счётчика', CALC.shiftWork({ work: 7.5 }), 7.5);
eq('конец меньше начала — берём поле «отработано»', CALC.shiftWork({ start: 120, end: 100, work: 5 }), 5);
eq('пусто — ноль', CALC.shiftWork({}), 0);

console.log('\nНорма расхода:');
eq('моточасы: 8 ч × 14,5 л/ч', CALC.normFor({ meter: 'hours', norm: 14.5 }, 8), 116);
eq('километры: 200 км × 38 л/100 км', CALC.normFor({ meter: 'km', norm: 38 }, 200), 76);
eq('обратный счёт для моточасов', CALC.rateOf({ meter: 'hours' }, 116, 8), 14.5);
eq('обратный счёт для километров', CALC.rateOf({ meter: 'km' }, 76, 200), 38);
is('без наработки расход не считается', CALC.rateOf({ meter: 'hours' }, 100, 0) === null);

/* ---------------------------------------------------------------- */
console.log('\nОстаток в баке: старт 100 л, смена 10 ч по 10 л/ч, заправка 200 л:');
reset();
const u1 = DB.addUnit({ name: 'Экскаватор', meter: 'hours', norm: 10, tank: 300, tankStart: 100, meterStart: 1000, serviceEvery: 250 });
DB.addShift({ unitId: u1.id, date: D(-5), start: 1000, end: 1010 });
DB.addFuel({ type: 'fill', unitId: u1.id, date: D(-4), liters: 200, price: 10000, source: 'tank' });
eq('в баке 100 + 200 − 100 = 200', CALC.tankLeft(u1).left, 200);
eq('счётчик дошёл до 1010', CALC.meterNow(u1), 1010);

console.log('Замер показал 150 л вместо 200 — недостача 50 л:');
DB.addFuel({ type: 'check', unitId: u1.id, date: D(-3), liters: 150, meter: 1010 });
const ch = CALC.checks(u1);
eq('замер один', ch.length, 1);
is('точка отсчёта есть (задан стартовый остаток)', ch[0].hasBase === true);
eq('по расчёту ожидалось 200', ch[0].expected, 200);
eq('отклонение −50', ch[0].deviation, -50);
eq('после замера остаток считается от него', CALC.tankLeft(u1).left, 150);

console.log('Итоги за период по этой технике:');
const p = CALC.unitPeriod(u1, D(-30), t);
eq('наработка 10 ч', p.work, 10);
eq('по норме 100 л', p.norm, 100);
eq('залито 200 л', p.filled, 200);
eq('денег 2 000 000', p.money, 2000000);
eq('недостача по замерам −50', p.deviation, -50);
eq('фактический расход 20 л/ч вместо 10', p.actualRate, 20);
is('перерасход отмечен: 50 л больше порога', p.problem === true);
eq('размер перерасхода 50 л', p.problemLiters, 50);

console.log('\nСмена в день замера считается сделанной до него:');
DB.addShift({ unitId: u1.id, date: D(-3), start: 1010, end: 1015 });
eq('остаток не изменился — смена «до» замера', CALC.tankLeft(u1).left, 150);
eq('и недостача ею объяснилась: было −50, стало 0', CALC.checks(u1)[0].deviation, 0);
DB.addShift({ unitId: u1.id, date: D(-2), start: 1015, end: 1020 });
eq('смена после замера списала 50 л', CALC.tankLeft(u1).left, 100);
eq('на замер она уже не влияет', CALC.checks(u1)[0].deviation, 0);

console.log('\nПорог перерасхода — мелкие расхождения не считаются:');
reset();
const u2 = DB.addUnit({ name: 'Погрузчик', meter: 'hours', norm: 10, tank: 300, tankStart: 300, meterStart: 0 });
DB.addShift({ unitId: u2.id, date: D(-5), work: 10 });
DB.addFuel({ type: 'check', unitId: u2.id, date: D(-4), liters: 195 });   // ожидалось 200, нашли 195
const p2 = CALC.unitPeriod(u2, D(-30), t);
eq('отклонение −5 л', p2.deviation, -5);
is('это погрешность замера, а не перерасход', p2.problem === false);

/* ---------------------------------------------------------------- */
console.log('\nТО по наработке (каждые 250 моточасов):');
reset();
const u3 = DB.addUnit({ name: 'Бульдозер', meter: 'hours', norm: 16, serviceEvery: 250, meterStart: 1000 });
DB.addService({ unitId: u3.id, date: D(-40), kind: 'to', meter: 1000 });
DB.addShift({ unitId: u3.id, date: D(-10), start: 1000, end: 1200 });
let st = CALC.unitState(u3);
eq('после ТО пройдено 200 ч', st.service.since, 200);
eq('осталось 50 ч', st.service.left, 50);
is('пора предупреждать (10% от 250 = 25… ещё нет)', st.service.soon === false);
DB.addShift({ unitId: u3.id, date: D(-5), start: 1200, end: 1235 });
st = CALC.unitState(u3);
eq('осталось 15 ч', st.service.left, 15);
is('теперь предупреждаем', st.service.soon === true);
DB.addShift({ unitId: u3.id, date: D(-1), start: 1235, end: 1275 });
st = CALC.unitState(u3);
is('ТО просрочено', st.service.overdue === true);
eq('переработано 25 ч', -st.service.left, 25);
console.log('Ремонт не сбрасывает счётчик ТО:');
DB.addService({ unitId: u3.id, date: t, kind: 'repair', meter: 1275 });
is('всё ещё просрочено', CALC.unitState(u3).service.overdue === true);
DB.addService({ unitId: u3.id, date: t, kind: 'to', meter: 1275 });
eq('после ТО счётчик обнулился', CALC.unitState(u3).service.since, 0);

/* ---------------------------------------------------------------- */
console.log('\nСклад ГСМ: приход 5000, выдано 1200 со склада и 300 на АЗС:');
reset();
const u4 = DB.addUnit({ name: 'Самосвал', meter: 'km', norm: 38, tank: 400, meterStart: 0 });
DB.addFuel({ type: 'intake', date: D(-10), liters: 5000, price: 9800 });
DB.addFuel({ type: 'fill', unitId: u4.id, date: D(-9), liters: 1200, price: 9800, source: 'tank' });
DB.addFuel({ type: 'fill', unitId: u4.id, date: D(-8), liters: 300, price: 10200, source: 'azs' });
let ts = CALC.tankState();
eq('на складе 3800 л', ts.left, 3800);
eq('заправка на АЗС склад не трогает', ts.out, 1200);
console.log('Замер склада 3700 — утекло 100 л:');
DB.addFuel({ type: 'tankcheck', date: D(-7), liters: 3700 });
ts = CALC.tankState();
eq('остаток теперь от замера', ts.left, 3700);
eq('замер один — он становится точкой отсчёта', ts.checks.length, 1);
is('у первого замера нет базы для сравнения', ts.checks[0].hasBase === false);
DB.addFuel({ type: 'intake', date: D(-6), liters: 1000, price: 9800 });
DB.addFuel({ type: 'tankcheck', date: D(-5), liters: 4650 });
ts = CALC.tankState();
eq('второй замер: ожидалось 4700', ts.checks[1].expected, 4700);
eq('недостача 50 л', ts.checks[1].deviation, -50);

/* ---------------------------------------------------------------- */
console.log('\nЗафиксированный слив:');
reset();
const u6 = DB.addUnit({ name: 'Кран', meter: 'hours', norm: 10, tank: 300, tankStart: 300, meterStart: 0 });
DB.addShift({ unitId: u6.id, date: D(-5), work: 10 });          // −100 л по норме
DB.addFuel({ type: 'drain', unitId: u6.id, date: D(-4), liters: 60, note: 'слив на стоянке' });
eq('остаток 300 − 100 − 60 = 140', CALC.tankLeft(u6).left, 140);
DB.addFuel({ type: 'check', unitId: u6.id, date: D(-3), liters: 140 });
eq('замер сходится — слив уже объяснён', CALC.checks(u6)[0].deviation, 0);
let p6 = CALC.unitPeriod(u6, D(-30), t);
eq('слив за период 60 л', p6.drained, 60);
eq('потеряно всего 60 л', p6.lost, 60);
is('это перерасход, даже без недостачи на замере', p6.problem === true);

console.log('Незаписанный слив всплывает как недостача:');
reset();
const u7 = DB.addUnit({ name: 'Кран 2', meter: 'hours', norm: 10, tank: 300, tankStart: 300, meterStart: 0 });
DB.addShift({ unitId: u7.id, date: D(-5), work: 10 });
DB.addFuel({ type: 'check', unitId: u7.id, date: D(-3), liters: 140 });   // 60 л пропали молча
eq('недостача 60 л', CALC.checks(u7)[0].deviation, -60);
eq('утечка найдена', CALC.leaks(u7).length, 1);
eq('и она размером 60 л', CALC.leaks(u7)[0].liters, 60);

console.log('\nСлив со склада:');
reset();
DB.addFuel({ type: 'intake', date: D(-10), liters: 5000, price: 9800 });
DB.addFuel({ type: 'drain', unitId: null, date: D(-9), liters: 200, note: 'порыв шланга' });
eq('на складе 4800 л', CALC.tankState().left, 4800);

/* ---------------------------------------------------------------- */
console.log('\nРегламент: срок по тому, что придёт раньше:');
reset();
const u8 = DB.addUnit({ name: 'Автокран', meter: 'km', norm: 30, meterStart: 0 });
DB.addProgram(u8.id, { id: 'to', name: 'ТО', everyWork: 10000, everyDays: 0 });
DB.addProgram(u8.id, { name: 'Освидетельствование', everyWork: 0, everyDays: 365 });
DB.addShift({ unitId: u8.id, date: D(-2), start: 0, end: 500 });
let sv = CALC.serviceStates(u8);
eq('работ в регламенте две', sv.length, 2);
const to8 = sv.filter(x => x.name === 'ТО')[0];
const os8 = sv.filter(x => x.name === 'Освидетельствование')[0];
eq('до ТО осталось 9500 км', to8.leftWork, 9500);
is('ТО считается по наработке', to8.by === 'work');
is('освидетельствование — по календарю', os8.by === 'days');
is('первым в списке — что ближе к сроку', sv[0].urgency <= sv[1].urgency);

console.log('Работа с двумя интервалами: календарь наступает раньше:');
reset();
const u9 = DB.addUnit({ name: 'Погрузчик', meter: 'hours', norm: 10, meterStart: 0, createdAt: D(-300) });
DB.addProgram(u9.id, { name: 'Масло', everyWork: 500, everyDays: 180 });
DB.addShift({ unitId: u9.id, date: D(-2), start: 0, end: 50 });
const sv9 = CALC.serviceStates(u9)[0];
is('срок считается по календарю', sv9.by === 'days');
is('и он просрочен', sv9.overdue === true);
eq('переработано 120 дней', -sv9.left, 120);

/* ---------------------------------------------------------------- */
console.log('\nРяд для графика уровня топлива:');
reset();
const u10 = DB.addUnit({ name: 'Экскаватор', meter: 'hours', norm: 10, tank: 400, tankStart: 200, meterStart: 0 });
DB.addShift({ unitId: u10.id, date: D(-4), work: 5 });                       // −50
DB.addFuel({ type: 'fill', unitId: u10.id, date: D(-3), liters: 300, price: 100, source: 'tank' });
DB.addShift({ unitId: u10.id, date: D(-3), work: 5 });                       // −50
DB.addFuel({ type: 'check', unitId: u10.id, date: D(-2), liters: 380 });
const ser = CALC.tankSeries(u10, D(-5), t);
eq('точек по числу дней', ser.length, 6);
eq('на старте 200 л', ser[0].level, 200);
eq('после смены 150 л', ser[1].level, 150);
eq('заправка подняла до 400 л', ser[2].level, 400);
eq('замер задал уровень 380 л', ser[3].level, 380);
eq('и показал недостачу 20 л', ser[3].deviation, -20);
eq('последний день держит уровень', ser[5].level, 380);

console.log('\nСебестоимость наработки:');
DB.addService({ unitId: u10.id, date: D(-2), kind: 'repair', sum: 20000 });
const p10 = CALC.unitPeriod(u10, D(-30), t);
eq('топливо 30 000', p10.money, 30000);
eq('с ремонтом 50 000', p10.costTotal, 50000);
eq('за 10 моточасов — 5 000 за час', p10.costPerWork, 5000);

/* ---------------------------------------------------------------- */
console.log('\nЗагрузка выгрузки из телематики:');
reset();
const tele =
  'Дата;Объект;Моточасы;Уровень топлива, л;Заправлено, л;Слито, л\n' +
  '01.09.2026;Экскаватор Cat;1000;300;;\n' +
  '02.09.2026;Экскаватор Cat;1008;210;;\n' +
  '03.09.2026;Экскаватор Cat;1016;350;250;\n' +
  '04.09.2026;Экскаватор Cat;1024;150;;80\n';
let rt = DB.importCSV(tele);
is('формат распознан как телематика', rt.kind === 'telemetry');
eq('техника создана', rt.units, 1);
eq('смен из счётчика три', rt.shifts, 3);
eq('заправка одна', rt.fills, 1);
eq('уровней четыре', rt.checks, 4);
eq('слив один', rt.drains, 1);
const ut = DB.unitByName('Экскаватор Cat');
eq('наработка второго дня 8 моточасов', CALC.shiftWork(DB.data.shifts[0]), 8);
eq('счётчик дошёл до 1024', CALC.meterNow(ut), 1024);
eq('слив попал в потери', CALC.unitPeriod(ut, '2026-09-01', '2026-09-30').drained, 80);
console.log('Повторная загрузка того же файла:');
rt = DB.importCSV(tele);
eq('новых смен нет', rt.shifts, 0);
eq('новых замеров нет', rt.checks, 0);
eq('новых сливов нет', rt.drains, 0);

/* ---------------------------------------------------------------- */
console.log('\nОтчёты по водителям и объектам:');
reset();
const d1 = DB.addDriver({ name: 'Рустам' });
const d2 = DB.addDriver({ name: 'Азиз' });
const u5 = DB.addUnit({ name: 'Экскаватор', meter: 'hours', norm: 10, meterStart: 0 });
DB.addShift({ unitId: u5.id, driverId: d1.id, date: D(-3), work: 8, site: 'Карьер' });
DB.addShift({ unitId: u5.id, driverId: d2.id, date: D(-2), work: 6, site: 'Карьер' });
DB.addShift({ unitId: u5.id, driverId: d1.id, date: D(-1), work: 7, site: 'ЖК' });
DB.addFuel({ type: 'fill', unitId: u5.id, driverId: d1.id, date: D(-1), liters: 200, price: 9800, source: 'tank' });
const dr = CALC.byDriver(D(-30), t);
const r1 = dr.filter(x => x.id === d1.id)[0];
eq('у Рустама 2 смены', r1.shifts, 2);
eq('наработка 15 ч', r1.workHours, 15);
eq('норма 150 л', r1.norm, 150);
eq('залил 200 л — на 50 больше нормы', r1.over, 50);
const si = CALC.bySite(D(-30), t);
eq('объектов два', si.length, 2);
eq('на Карьере 14 ч → 140 л по норме', si.filter(x => x.name === 'Карьер')[0].norm, 140);

/* ---------------------------------------------------------------- */
console.log('\nЗагрузка из таблицы CSV:');
reset();
let res = DB.importCSV(
  'Название;Госномер;Тип;Счётчик;Норма;Бак;Топливо;ТО через\n' +
  'Экскаватор Cat;EX 01;Экскаватор;моточасы;15;400;ДТ;250\n' +
  'Самосвал MAN;01 A 777;Самосвал;км;36;350;ДТ;10000\n');
eq('добавлено 2 единицы', res.added, 2);
is('тип таблицы распознан', res.kind === 'units');
is('у самосвала счётчик в километрах', DB.unitByName('Самосвал MAN').meter === 'km');
eq('норма прочиталась', DB.unitByName('Экскаватор Cat').norm, 15);
res = DB.importCSV(
  'Дата;Техника;Водитель;Литров;Цена;Счётчик;Заметка\n' +
  '01.08.2026;EX 01;Рустам Хайдаров;300;9800;1200;по талону\n');
eq('добавлена 1 заправка', res.added, 1);
is('водитель создан автоматически', !!DB.driverByName('Рустам Хайдаров'));
is('дата разобрана', DB.data.fuel[0].date === '2026-08-01');
eq('сумма посчитана', DB.data.fuel[0].sum, 300 * 9800);

console.log('\nРезервная копия: выгрузка и загрузка обратно:');
const dump = DB.exportJSON();
const before = DB.data.units.length;
reset();
DB.importJSON(dump, 'replace');
eq('техника вернулась', DB.data.units.length, before);
DB.importJSON(dump, 'merge');
eq('повторная загрузка не создала дублей', DB.data.units.length, before);

/* ---------------------------------------------------------------- */
console.log('\nДемонстрационный набор:');
DB.data = DB.demo();
CALC.clearCache();
const f = CALC.fleet(U.monthStart(t), t);
is('техника есть', DB.data.units.length === 6);
is('смены есть', DB.data.shifts.length > 100);
is('за месяц что-то залито', f.filled > 0);
is('две машины с потерями', f.problems.length === 2);
is('самосвал №1 — недостача по замерам', CALC.unitPeriod(DB.unit('u3'), U.monthStart(t), t).deviation < -100);
is('погрузчик — пойманный слив 120 л', CALC.unitPeriod(DB.unit('u2'), U.monthStart(t), t).drained === 120);
is('у экскаватора с датчиком ложной тревоги нет', CALC.unitPeriod(DB.unit('u1'), U.monthStart(t), t).problem === false);
is('есть просроченное ТО', f.serviceOverdue.length > 0);
is('на складе положительный остаток', CALC.tankState().left > 0);
is('в журнале есть записи', CALC.feed(10).length === 10);

console.log('\n' + (bad ? '✗ ошибок: ' + bad + ' из ' + (ok + bad) : '✓ все ' + ok + ' проверок прошли'));
process.exit(bad ? 1 : 0);
