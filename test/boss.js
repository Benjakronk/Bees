// BIER -- verifies the Vespa crabro boss: it's a heavyweight, it doesn't flee,
// it enrages and summons wasps at low health, and slaying it pays out big.
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
    // spawn the boss
    const surf = T.surf[Comb.hive.x | 0];
    const v = new Threat(80, surf - 120, 'vespa');
    G.threats.push(v);
    const spawned = { boss: v.boss, maxHp: v.maxHp, hw: v.hw };

    // let it operate for a while near a full hive; it should approach and not flee
    let broodBefore = G.hive.broodCount;
    for (let i = 0; i < 900; i++) updatePlay();
    const v2 = G.threats.find(t => t.id === v.id);
    const survivedAndAggressive = !!v2 && !v2.fleeing && v2.hp > 0;
    const movedToHive = v2 ? Math.abs(v2.x - Comb.hive.x) < 700 : false;

    // force enrage and a ready summon; one tick should call in a wasp
    let summoned = false;
    if (v2) {
      const waspsBefore = G.threats.filter(t => t.kind === 'wasp' && !t.dead).length;
      v2.hp = v2.maxHp * 0.2; v2.summonCd = 1;
      for (let i = 0; i < 4; i++) updatePlay();
      const waspsAfter = G.threats.filter(t => t.kind === 'wasp' && !t.dead).length;
      summoned = waspsAfter > waspsBefore;
    }

    // slay it: big payout, removed from the field
    const scoreBefore = G.hive.score;
    let payout = 0, removed = false;
    if (v2) {
      v2.hp = 0; updatePlay();
      payout = G.hive.score - scoreBefore;
      removed = !G.threats.some(t => t.id === v.id);
    }
    return { spawned, survivedAndAggressive, movedToHive, summoned, payout, removed };
  });

  await browser.close();
  console.log(JSON.stringify(r, null, 2));
  const ok = r.spawned.boss && r.spawned.maxHp >= 200 && r.spawned.hw >= 7 &&
             r.survivedAndAggressive && r.summoned && r.payout >= 150 && r.removed &&
             errors.length === 0;
  console.log('ERRORS', errors.length, errors.join('\n'));
  console.log(ok ? 'BOSS OK' : 'BOSS FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
