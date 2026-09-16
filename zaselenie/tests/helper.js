/* Общая обвязка для тестов: загрузка модулей и простые проверки */
require('../js/util.js');
require('../js/knowledge.js');
require('../js/holds.js');
require('../js/nlu.js');
require('../js/policy.js');
require('../js/reply.js');
require('../js/risk.js');
require('../js/scenarios.js');
require('../js/agent.js');

/* Фиксируем «сегодня», иначе тесты зависят от дня запуска */
U.NOW = '2026-03-02';                                  // понедельник

var state = { ok: 0, bad: 0, fails: [] };

function is(name, cond, got) {
  if (cond) { state.ok++; console.log('  ✓', name); }
  else { state.bad++; state.fails.push(name); console.log('  ✗', name, got === undefined ? '' : '— получено: ' + JSON.stringify(got)); }
}

function eq(name, a, b) { is(name, a === b, a); }

/* Каждый раздел начинается с чистого листа: удержания живут в общем реестре
   и иначе протекают из предыдущих проверок */
function head(title) {
  if (global.HOLDS) HOLDS.reset();
  console.log('\n' + title);
}

function done() {
  console.log('\nИтого: ' + state.ok + ' успешно, ' + state.bad + ' с ошибкой');
  if (state.bad) { console.log('Не прошли: ' + state.fails.join('; ')); process.exitCode = 1; }
}

module.exports = { is: is, eq: eq, head: head, done: done, state: state };
