// BIER -- fast-forward stability test. Runs the sim for many ticks without
// rendering and samples the hive's trajectory, watching for NaN / collapse /
// runaway growth / errors.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(120);
  await page.keyboard.press('Enter'); await page.waitForTimeout(250);
  await page.keyboard.press('Space'); await page.waitForTimeout(250);

  const samples = await page.evaluate(() => {
    const out = [];
    let threatsSeen = 0, maxBees = 0;
    for (let i = 0; i < 54000; i++) {     // ~5 in-game days
      updatePlay();
      threatsSeen = Math.max(threatsSeen, G.threats.length);
      maxBees = Math.max(maxBees, G.bees.filter(b => b.hp > 0).length);
      if (i % 6000 === 0) {
        const st = {};
        let carrying = 0, nsum = 0;
        for (const b of G.bees) {
          if (b.hp <= 0 || b.playerIdx >= 0) continue;
          st[b.state] = (st[b.state] || 0) + 1;
          if (b.caste === 'worker' && (b.state === 'forage' || b.state === 'store')) { carrying++; nsum += b.nectar; }
        }
        out.push({
          tick: G.tick, day: G.day,
          bees: G.bees.filter(b => b.hp > 0).length,
          honey: Math.round(G.hive.honeyUnits),
          pollen: Math.round(G.hive.pollenUnits),
          brood: G.hive.broodCount,
          threats: G.threats.length,
          states: st,
          avgNectarForaging: carrying ? Math.round(nsum / carrying * 10) / 10 : 0,
          finite: isFinite(G.hive.honeyUnits) && isFinite(G.hive.pollenUnits),
        });
      }
      if (G.state !== 'play') break;   // win / gameover
    }
    return { out, threatsSeen, maxBees, endState: G.state };
  });

  await browser.close();
  console.log(JSON.stringify(samples, null, 2));
  console.log('ERRORS:', errors.length);
  errors.forEach(e => console.log(e));
  const bad = samples.out.some(s => !s.finite || s.bees <= 0) || errors.length;
  console.log(bad ? 'STRESS ISSUES' : 'STRESS OK');
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
