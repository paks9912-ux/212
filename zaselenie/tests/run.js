/* Все проверки разом: node zaselenie/tests/run.js */
var path = require('path');
var files = ['nlu.test.js', 'policy.test.js', 'scenarios.test.js', 'bot.test.js'];
var failed = 0;

files.forEach(function (f) {
  console.log('\n══════ ' + f + ' ══════');
  var r = require('child_process').spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
});

console.log('\n' + (failed ? failed + ' набор(а) тестов с ошибками' : 'Все наборы прошли'));
process.exitCode = failed ? 1 : 0;
