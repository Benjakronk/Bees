// BIER -- runs the autonomous hive across the whole seasonal arc to winter,
// sampling honey at each day boundary and reporting the outcome.
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
    const days = [];
    let lastDay = -1;
    // keep the player bee out of harm so the run isn't cut short by takeover
    for (let i = 0; i < 130000; i++) {
      if (G.players[0] && G.players[0].bee) { G.players[0].bee.hp = G.players[0].bee.maxHp; G.players[0].bee.x = Comb.hive.broodCx; G.players[0].bee.y = Comb.hive.cavY0 + 30; }
      updatePlay();
      if (G.day !== lastDay) {
        lastDay = G.day;
        days.push({ day: G.day, season: G.hive.season().name, honey: Math.round(G.hive.honeyUnits),
          bees: G.bees.filter(b => b.hp > 0).length, brood: G.hive.broodCount, state: G.state });
      }
      if (G.state === 'win' || G.state === 'gameover') break;
    }
    return { days, endState: G.state, won: G.hive.won };
  });
  await browser.close();
  for (const d of r.days) console.log(`day ${d.day}  ${d.season}\thoney ${d.honey}\tbees ${d.bees}\tbrood ${d.brood}\t${d.state}`);
  console.log('END:', r.endState, 'won:', r.won, 'errors:', errors.length);
  errors.forEach(e => console.log(e));
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
