// BIER smoke test -- boots the game, drives it through a short play session,
// and reports any console / page errors. Reuses the Ants project's Playwright.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const PW = path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright');
const { chromium } = require(PW);

const INDEX = path.resolve(__dirname, '..', 'index.html');

(async () => {
  const errors = [];
  const logs = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });

  page.on('console', m => { logs.push(m.type() + ': ' + m.text()); if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + '\n' + (e.stack || '')));

  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(400);

  const press = async (key, ms = 120) => { await page.keyboard.press(key); await page.waitForTimeout(ms); };
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

  // title -> slots -> new hive (1 player) -> intro -> play
  await press('Enter');         // START GAME
  await press('Enter');         // HIVE 1
  await page.waitForTimeout(300);
  await press('Space');         // skip intro
  await page.waitForTimeout(300);

  // confirm we reached play and grab state
  const stateAfterStart = await page.evaluate(() => ({
    state: G.state, bees: G.bees.length, cells: Comb.cells.length,
    flowers: G.flowers.length, honey: Math.round(G.hive.honeyUnits),
  }));
  logs.push('AFTER START: ' + JSON.stringify(stateAfterStart));

  // fly around: out the door, gather, come back, deposit
  await hold('KeyD', 1500);
  await hold('KeyW', 800);
  await hold('KeyA', 1500);
  await hold('KeyE', 1500);     // try gathering / interacting
  await hold('KeyS', 800);
  await hold('Space', 400);     // sting
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyM');  // map
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyM');

  // let the simulation run a while to exercise the hive AI
  await page.waitForTimeout(2500);

  const finalState = await page.evaluate(() => ({
    state: G.state,
    bees: G.bees.filter(b => b.hp > 0).length,
    threats: G.threats.length,
    honey: Math.round(G.hive.honeyUnits),
    pollen: Math.round(G.hive.pollenUnits),
    brood: G.hive.broodCount,
    tick: G.tick,
    playerAlive: !!(G.players[0] && G.players[0].bee),
    playerNectar: G.players[0] && G.players[0].bee ? Math.round(G.players[0].bee.nectar * 10) / 10 : null,
  }));
  logs.push('FINAL: ' + JSON.stringify(finalState));

  await page.screenshot({ path: path.resolve(__dirname, 'smoke.png') });

  await browser.close();

  console.log('--- LOGS ---');
  for (const l of logs) console.log(l);
  console.log('--- ERRORS (' + errors.length + ') ---');
  for (const e of errors) console.log(e);
  process.exit(errors.length ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(2); });
