'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message));
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    for (let i = 0; i < 16000; i++) updatePlay();
    const st = {};
    for (const b of G.bees) if (b.playerIdx < 0 && b.hp > 0) st[b.state] = (st[b.state] || 0) + 1;
    let builtCells = 0, builtEmpty = 0, buildable = 0, total = Comb.cells.length;
    for (const c of Comb.cells) {
      if (c.built) { builtCells++; if (c.type === 'empty') builtEmpty++; }
      else if (c.nbrs.some(n => n.built)) buildable++;
    }
    return {
      honey: Math.round(G.hive.honeyUnits), pollen: Math.round(G.hive.pollenUnits),
      bees: G.bees.filter(b => b.hp > 0).length, states: st,
      builtCells, builtEmpty, buildable, total,
      wantBuild: G.hive.wantBuild(), foragingDrive: Math.round(G.hive.foragingDrive() * 100) / 100,
      emptyCellsCached: G.hive.emptyCells, buildableCached: G.hive.buildable,
    };
  });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
