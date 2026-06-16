// BIER perf probe -- measures pure JS draw cost of drawPlay() by calling it
// many times in the 'play' state, plus a breakdown of the gradient-heavy paths.
// Headless, so this isolates the JS/canvas cost (not the CSS CRT compositing).
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const PW = path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright');
const { chromium } = require(PW);
const INDEX = path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);

  const press = async (k, ms = 100) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
  await press('Enter');   // START GAME
  await press('Enter');   // HIVE 1
  await page.waitForTimeout(300);
  await press('Space');   // intro -> play

  const measure = () => page.evaluate(() => {
    const N = 1200;
    for (let i = 0; i < 60; i++) drawPlay();   // warm up
    const t0 = performance.now();
    for (let i = 0; i < N; i++) drawPlay();
    const dt = performance.now() - t0;
    return { frames: N, perFrameMs: +(dt / N).toFixed(3), inside: !!(G.players[0].bee && G.players[0].bee.inside) };
  });

  // park the bee deep in the comb so the inside (comb + knothole gradient) path runs
  await page.evaluate(() => {
    const b = G.players[0].bee, h = G.hg;
    b.inside = true; b.layerCd = 9999; b.x = h.broodCx; b.y = h.broodCy;
    b.vx = b.vy = 0; updateCameras();
  });
  console.log('PERF inside ', JSON.stringify(await measure()));
  // place the bee out in the open meadow -> measure sky/hills/clouds/gloom path
  await page.evaluate(() => {
    const b = G.players[0].bee, h = G.hg;
    b.inside = false; b.layerCd = 9999;
    b.x = h.outer.x + h.entSide * 200; b.y = h.entrance.y - 80;
    b.vx = b.vy = 0; updateCameras();
  });
  console.log('PERF outside', JSON.stringify(await measure()));
  console.log('ERRORS', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
