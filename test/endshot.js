'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  // clean in-hive gameplay shot with the player among the comb
  await page.evaluate(() => {
    const h = Comb.hive, b = G.players[0].bee;
    b.x = h.broodCx - 20; b.y = h.broodCy - 50; b.nectar = 6; b.pollen = 3;
    G.players[0].cam.x = b.x - 160; G.players[0].cam.y = b.y - 80;
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-play.png') });

  // trigger the win screen
  await page.evaluate(() => {
    for (const c of Comb.cells) if (c.zone === 'honey' && c.type === 'empty') { c.type = 'honey'; c.amount = 1; c.capped = true; }
    G.hive.refreshTotals(); G.tick = DAY_LEN * 10 + 50;
    for (let i = 0; i < 30 && G.state === 'play'; i++) updatePlay();
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-win.png') });
  await browser.close();
  console.log('endshots written');
})().catch(e => { console.error(e); process.exit(1); });
