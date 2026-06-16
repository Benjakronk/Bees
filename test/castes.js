// BIER -- verifies the castes play differently: worker forages/builds,
// guard can't forage but dashes, queen lays eggs.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');

const ACT = 'KeyE', STING = 'Space';

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

  // helper: force the player bee to a caste and park it at a flower (outside)
  const setupAtFlower = (caste) => page.evaluate((caste) => {
    const f = G.flowers.find(f => f.bloomLevel() > 0.5) || G.flowers[0];
    const b = G.players[0].bee;
    b.caste = caste; b.maxSpeed = b.def.speed;
    b.x = f.x; b.y = f.y - 4; b.vx = b.vy = 0; b.nectar = 0; b.pollen = 0;
    b.inside = false; b.layerCd = 999; G.players[0].trans = null;
  }, caste);

  const holdAct = async (ms) => { await page.keyboard.down(ACT); await page.waitForTimeout(ms); await page.keyboard.up(ACT); };

  // WORKER forages
  await setupAtFlower('worker');
  await holdAct(700);
  const workerNectar = await page.evaluate(() => Math.round(G.players[0].bee.nectar * 10) / 10);

  // GUARD cannot forage, but can dash
  await setupAtFlower('guard');
  await holdAct(700);
  const guardNectar = await page.evaluate(() => Math.round(G.players[0].bee.nectar * 10) / 10);
  // dash: deterministically fire the sting key for one sim frame and read speed
  const guardSpeedAfter = await page.evaluate(() => {
    const b = G.players[0].bee; b.vx = b.vy = 0; b.stingCd = 0;
    pressed[BIND[0].sting] = true; keys[BIND[0].sting] = true;
    updatePlay();
    keys[BIND[0].sting] = false;
    return Math.round(Math.hypot(b.vx, b.vy) * 100) / 100;
  });

  // QUEEN lays an egg in an empty brood cell
  const queenLaid = await page.evaluate(() => {
    const b = G.players[0].bee;
    const cell = Comb.cells.find(c => c.built && c.zone === 'brood' && c.type === 'empty')
      || (() => { const c = Comb.cells.find(c => c.built && c.zone === 'brood'); c.type = 'empty'; return c; })();
    // make sure there's honey to spend
    for (const c of Comb.cells) if (c.built && c.zone !== 'brood') { c.type = 'honey'; c.amount = 1; }
    G.hive.refreshTotals();
    b.caste = 'queen'; b.inside = true; b.layerCd = 999; G.players[0].trans = null;
    b.x = cell.x; b.y = cell.y; b.vx = b.vy = 0; b.feedCd = 0;
    window.__qc = cell.id;
    return cell.type;
  });
  await holdAct(900);
  const queenCellType = await page.evaluate(() => Comb.cells.find(c => c.id === window.__qc).type);

  await browser.close();
  const r = { workerNectar, guardNectar, guardSpeedAfter, queenWas: queenLaid, queenNow: queenCellType };
  console.log(JSON.stringify(r, null, 2));
  const ok =
    workerNectar > 0 &&             // worker forages
    guardNectar === 0 &&            // guard cannot forage
    guardSpeedAfter > 1 &&          // guard dash imparts speed
    queenCellType === 'egg' &&      // queen lays
    errors.length === 0;
  console.log('ERRORS', errors.length, errors.join('\n'));
  console.log(ok ? 'CASTES OK' : 'CASTES FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
