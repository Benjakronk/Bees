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
  await page.evaluate(() => {
    const h = Comb.hive, b = G.players[0].bee;
    // player just outside the entrance, boss looming in front of the trunk
    b.inside = false; b.layerCd = 999; G.players[0].trans = null;
    b.x = h.outer.x + h.entSide * 30; b.y = h.entrance.y - 24; b.vx = b.vy = 0;
    const v = new Threat(h.outer.x + h.entSide * 60, h.entrance.y - 30, 'vespa');
    v.hp = v.maxHp * 0.55; v.dir = -h.entSide;
    G.threats.push(v);
    G.players[0].cam.x = b.x - 160; G.players[0].cam.y = b.y - 80;
  });
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-boss.png') });
  await browser.close();
  console.log('boss shot written');
})().catch(e => { console.error(e); process.exit(1); });
