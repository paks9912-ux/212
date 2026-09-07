/* E2E: реальный прогон заказа в браузере. Проверяем, что деньги-критичный
   путь (корзина -> оформление -> ссылка в WhatsApp) работает. */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const path = require('path');

const FILE = 'file://' + path.join(__dirname, '..', 'dist', 'sakura.html');
let fails = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fails++; };
const reset = async (page, FILE) => { await page.goto(FILE); await page.evaluate(() => localStorage.clear()); await page.goto(FILE); await page.waitForTimeout(250); };
const card = (page, name) => page.locator('.item:has(.iname:text-is("' + name + '"))');

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(300);

  console.log('\n1. Загрузка меню');
  ok((await page.title()).includes('SAKURA'), 'заголовок страницы: ' + await page.title());
  ok(await page.locator('.item').count() === 14, 'позиций отрисовано: ' + await page.locator('.item').count());
  ok(await page.locator('.tab').count() === 4, 'категорий: ' + await page.locator('.tab').count());
  ok((await page.locator('#shopname').innerText()) === 'SAKURA', 'название заведения');
  await page.screenshot({ path: '/tmp/claude-0/-home-user-212/9e0ee885-b0b0-5201-8bdc-109dc482b95c/scratchpad/shot-1-menu.png', fullPage: false });

  console.log('\n2. Корзина');
  ok(!(await page.locator('#bar').getAttribute('class')).includes('show'), 'панель корзины скрыта при пустой корзине');
  await page.locator('.item').first().getByText('Добавить').click();   // Сет Токио 289000
  await page.waitForTimeout(150);
  ok((await page.locator('#bar').getAttribute('class')).includes('show'), 'панель появилась после добавления');
  ok((await page.locator('#barIn b').innerText()).includes('289 000'), 'сумма в панели: ' + await page.locator('#barIn b').innerText());

  // добавим ролл и увеличим количество
  await card(page, 'Филадельфия').getByText('Добавить').click();
  await card(page, 'Филадельфия').locator('.qty button').nth(1).click();
  await page.waitForTimeout(150);
  ok((await page.locator('#barIn b').innerText()).includes('425 000'), 'сумма после 2× Филадельфия (289000+136000): ' + await page.locator('#barIn b').innerText());

  console.log('\n3. Бесплатная доставка / итог');
  await page.locator('#barIn').click();
  await page.waitForTimeout(350);
  const cartTxt = await page.locator('#sheetBody').innerText();
  ok(cartTxt.includes('бесплатно'), 'доставка бесплатна при сумме >= 200 000');
  ok(cartTxt.includes('425 000'), 'итог в корзине верный');
  await page.screenshot({ path: '/tmp/claude-0/-home-user-212/9e0ee885-b0b0-5201-8bdc-109dc482b95c/scratchpad/shot-2-cart.png' });

  console.log('\n4. Валидация формы');
  await page.locator('#toCheckout').click();
  await page.waitForTimeout(300);
  await page.locator('#sendWA').click();          // пустая форма
  await page.waitForTimeout(200);
  ok(await page.locator('#fName.bad').count() === 1, 'пустое имя подсвечено как ошибка');
  ok(await page.locator('#fPhone.bad').count() === 1, 'пустой телефон подсвечен как ошибка');

  console.log('\n5. Оформление и ссылка на WhatsApp');
  await page.locator('#fName').fill('Иван');
  await page.locator('#fPhone').fill('+998 90 123 45 67');
  await page.locator('#fAddr').fill('ул. Амира Темура 15, кв. 3');
  await page.locator('#fNote').fill('Без имбиря');
  await page.locator('.chip[data-pay="Click / Payme"]').click();
  await page.screenshot({ path: '/tmp/claude-0/-home-user-212/9e0ee885-b0b0-5201-8bdc-109dc482b95c/scratchpad/shot-3-checkout.png' });

  await page.evaluate(() => { window.__opened = []; window.open = (u) => { window.__opened.push(u); return null; }; });
  await page.locator('#sendWA').click();
  await page.waitForTimeout(200);
  const url = await page.evaluate(() => window.__opened[0] || '');
  ok(url.startsWith('https://wa.me/998900000000?text='), 'открылась ссылка wa.me на номер заведения');
  const order = decodeURIComponent((url.split('text=')[1] || ''));
  console.log('\n--- ТЕКСТ ЗАКАЗА, который получит заведение ---\n' + order + '\n--- конец ---');
  ok(order.includes('НОВЫЙ ЗАКАЗ — SAKURA'), 'шапка заказа');
  ok(order.includes('Иван') && order.includes('+998 90 123 45 67'), 'имя и телефон');
  ok(order.includes('ул. Амира Темура 15'), 'адрес доставки');
  ok(order.includes('Сет «Токио» × 1'), 'позиция 1');
  ok(order.includes('Филадельфия × 2 — 136 000'), 'позиция 2 с количеством и суммой');
  ok(order.includes('ИТОГО: 425 000 сум'), 'итоговая сумма');
  ok(order.includes('Click / Payme'), 'способ оплаты');
  ok(order.includes('Без имбиря'), 'комментарий');

  console.log('\n6. После отправки');
  await page.waitForTimeout(400);
  ok(!(await page.locator('#bar').getAttribute('class')).includes('show'), 'корзина очищена после отправки');

  console.log('\n7. Минимальный заказ');
  await reset(page, FILE);
  await card(page, 'Вода без газа 0,5').getByText('Добавить').click();  // 7000 < 80000
  await page.locator('#barIn').click(); await page.waitForTimeout(300);
  ok(await page.locator('#toCheckout[disabled]').count() === 1, 'кнопка заблокирована ниже минимальной суммы');
  ok((await page.locator('#sheetBody, #sheetFoot').allInnerTexts()).join(' ').includes('Минимальный заказ'), 'показано предупреждение о минимуме');

  console.log('\n8. Самовывоз обнуляет доставку');
  await reset(page, FILE);
  await card(page, 'Рамен с курицей').getByText('Добавить').click();   // 55 000
  await card(page, 'Гёдза').getByText('Добавить').click();             // 38 000  => 93 000
  await page.locator('#barIn').click(); await page.waitForTimeout(300);
  const t8 = await page.locator('#sheetBody').innerText();
  ok(t8.includes('15 000'), 'доставка 15 000 при сумме ниже порога бесплатной');
  ok(t8.includes('108 000'), 'итог 93 000 + 15 000 доставки = 108 000');
  await page.locator('#toCheckout').click(); await page.waitForTimeout(250);
  await page.locator('.chip[data-mode="pickup"]').click(); await page.waitForTimeout(200);
  ok((await page.locator('#ckTotal').innerText()).includes('93 000'), 'при самовывозе доставка не добавляется: ' + await page.locator('#ckTotal').innerText());

  console.log('\n9. Корзина переживает перезагрузку');
  await page.goto(FILE); await page.waitForTimeout(300);
  ok((await page.locator('#bar').getAttribute('class')).includes('show'), 'корзина восстановлена из localStorage');

  console.log('\n10. Ошибки в консоли');
  ok(errors.length === 0, errors.length ? 'ОШИБКИ: ' + errors.join(' | ') : 'ошибок нет');

  await browser.close();
  console.log('\n' + (fails ? '❌ Провалено проверок: ' + fails : '✅ Все проверки пройдены'));
  process.exit(fails ? 1 : 0);
})();
