// BIER -- verifies the inside/outside layer transitions and comb building.
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
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  const r = await page.evaluate(() => {
    const b = G.players[0].bee, h = Comb.hive;
    // EXIT: start at the inner waypoint, step the sim, expect to pop outside
    b.inside = true; b.layerCd = 0; b.x = h.inner.x; b.y = h.inner.y; b.vx = b.vy = 0;
    for (let i = 0; i < 6 && b.inside; i++) updatePlay();
    const exited = !b.inside;

    // ENTER: place at the entrance hole, step, expect to pop inside
    b.layerCd = 0; b.x = h.entrance.x; b.y = h.entrance.y; b.vx = b.vy = 0;
    for (let i = 0; i < 6 && !b.inside; i++) updatePlay();
    const entered = b.inside;

    // BUILD: drop onto a buildable cell with honey in stock, hold the action
    const spot = Comb.buildableNear(h.broodCx, h.broodCy, 9999);
    let built = false, builtId = -1;
    if (spot) {
      builtId = spot.id;
      // make sure there's honey to spend on wax
      for (const c of Comb.cells) if (c.built && c.zone !== 'brood') { c.type = 'honey'; c.amount = 1; c.capped = true; }
      G.hive.refreshTotals();
      const pb = G.players[0].bee;
      pb.inside = true; pb.layerCd = 999; pb.x = spot.x; pb.y = spot.y; pb.vx = pb.vy = 0; pb.buildT = 0;
      keys[BIND[0].act] = true;
      for (let i = 0; i < 80 && !spot.built; i++) updatePlay();
      keys[BIND[0].act] = false;
      built = spot.built;
    }
    return { exited, entered, built, builtId };
  });
  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const ok = r.exited && r.entered && r.built && errors.length === 0;
  console.log('ERRORS', errors.length, errors.join('\n'));
  console.log(ok ? 'LAYERS OK' : 'LAYERS FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
