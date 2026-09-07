const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path'), fs = require('fs');
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto('file://' + path.join(__dirname, '..', 'builder.html'));
  await p.waitForTimeout(400);

  console.log('\n1. Конструктор');
  await p.locator('#btnDemo').click();
  await p.waitForTimeout(500);
  const stat = await p.locator('#stat').innerText();
  ok(/Категорий: 3/.test(stat) && /позиций: 7/.test(stat), 'пример разобран: ' + stat);

  console.log('\n2. Предпросмотр');
  const fr = p.frameLocator('#prev');
  ok((await fr.locator('#shopname').innerText()) === 'SAKURA', 'название в предпросмотре');
  ok(await fr.locator('.item').count() === 7, 'позиций в предпросмотре: ' + await fr.locator('.item').count());

  console.log('\n3. Правка цены обновляет сайт');
  const first = p.locator('#cats input[type=number]').first();
  await first.fill('300000'); await p.waitForTimeout(400);
  ok((await fr.locator('.item').first().locator('.price').innerText()).includes('300 000'), 'цена обновилась в предпросмотре');

  console.log('\n4. Скачанный файл — рабочий сайт');
  const html = await p.evaluate(() => {
    const t = window.__t || null; return document.querySelector('#prev').srcdoc;
  });
  const tmp = '/tmp/claude-0/-home-user-212/9e0ee885-b0b0-5201-8bdc-109dc482b95c/scratchpad/out.html';
  fs.writeFileSync(tmp, html);
  const p2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  const e2 = []; p2.on('pageerror', e => e2.push(String(e)));
  await p2.goto('file://' + tmp); await p2.waitForTimeout(300);
  await p2.locator('.item').first().getByText('Добавить').click();
  await p2.waitForTimeout(200);
  ok((await p2.locator('#barIn b').innerText()).includes('300 000'), 'заказ работает в собранном файле');
  ok(e2.length === 0, 'без ошибок в собранном файле' + (e2.length ? ': ' + e2.join('|') : ''));
  await p.screenshot({ path: '/tmp/claude-0/-home-user-212/9e0ee885-b0b0-5201-8bdc-109dc482b95c/scratchpad/shot-builder.png' });

  console.log('\n5. Ошибки конструктора');
  ok(errs.length === 0, errs.length ? 'ОШИБКИ: ' + errs.join(' | ') : 'ошибок нет');
  await b.close();
  console.log('\n' + (fails ? '❌ Провалено: ' + fails : '✅ Конструктор работает'));
  process.exit(fails ? 1 : 0);
})();
