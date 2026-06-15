// BIER -- verifies the victory trigger: winter day reached with a full larder.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');
(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    // stuff the comb with honey, jump to winter, and step the sim
    for (const c of Comb.cells) if (c.zone === 'honey' && c.type === 'empty') { c.type = 'honey'; c.amount = 1; c.capped = true; }
    G.hive.refreshTotals();
    G.tick = DAY_LEN * 10 + 50;
    const before = { day: G.day, honey: Math.round(G.hive.honeyUnits), state: G.state };
    for (let i = 0; i < 60 && G.state === 'play'; i++) updatePlay();
    return { before, after: { state: G.state, won: G.hive.won } };
  });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const ok = r.after.state === 'win' && r.after.won && errors.length === 0;
  console.log('ERRORS', errors.length, errors.join('\n'));
  console.log(ok ? 'WIN OK' : 'WIN FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
