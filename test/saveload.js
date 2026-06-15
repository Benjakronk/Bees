// BIER -- save/load round-trip test.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');
(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  const saved = await page.evaluate(() => {
    for (let i = 0; i < 1200; i++) updatePlay();
    const ok = saveWorld(1);
    // freeze so the live loop + beforeunload don't re-save at a later tick
    G.state = 'pause'; G.running = false;
    return { ok, seed: G.seed, tick: G.tick, bees: G.bees.length,
      honey: Math.round(G.hive.honeyUnits), score: G.hive.score };
  });

  // reload the page (fresh JS state), then load slot 1
  await page.reload();
  await page.waitForTimeout(400);
  const loaded = await page.evaluate(() => {
    const okData = !!loadWorldData(1);
    const ok = loadWorld(1, 1);
    return { okData, ok, seed: G.seed, tick: G.tick, bees: G.bees.length,
      honey: Math.round(G.hive.honeyUnits), score: G.hive.score, state: G.state };
  });

  await browser.close();
  console.log('SAVED ', JSON.stringify(saved));
  console.log('LOADED', JSON.stringify(loaded));
  const ok = saved.ok && loaded.okData && loaded.ok &&
             loaded.seed === saved.seed && loaded.tick === saved.tick &&
             Math.abs(loaded.honey - saved.honey) <= 6 && errors.length === 0;
  console.log('ERRORS', errors.length, errors.join('\n'));
  console.log(ok ? 'SAVELOAD OK' : 'SAVELOAD FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
