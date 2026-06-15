// BIER core-loop test -- deterministically verifies gather -> deposit -> feed
// by teleporting the player bee onto a flower, an empty cell, and a hungry larva.
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
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.press('Space'); await page.waitForTimeout(300);

  const results = {};

  // --- 1. GATHER: drop the player onto a blooming flower, hold E ---
  await page.evaluate(() => {
    const f = G.flowers.find(f => f.bloomLevel() > 0.5) || G.flowers[0];
    window.__f = f;
    const b = G.players[0].bee;
    b.x = f.x; b.y = f.y - 4; b.vx = b.vy = 0; b.nectar = 0; b.pollen = 0;
    b.inside = false; b.layerCd = 999;   // outside, at the flower
  });
  await page.keyboard.down('KeyE'); await page.waitForTimeout(900); await page.keyboard.up('KeyE');
  results.gather = await page.evaluate(() => {
    const b = G.players[0].bee;
    return { nectar: Math.round(b.nectar * 10) / 10, pollen: Math.round(b.pollen * 10) / 10 };
  });

  // --- 2. DEPOSIT: drop onto an empty honey-zone cell, hold E ---
  await page.evaluate(() => {
    const cell = Comb.cells.find(c => c.built && c.type === 'empty' && c.zone !== 'brood');
    window.__cellId = cell.id;
    const b = G.players[0].bee;
    b.x = cell.x; b.y = cell.y; b.vx = b.vy = 0;
    b.nectar = b.def.nectarCap; // full of nectar
    b.inside = true; b.layerCd = 999;   // inside, at the cell
  });
  await page.keyboard.down('KeyE'); await page.waitForTimeout(1200); await page.keyboard.up('KeyE');
  results.deposit = await page.evaluate(() => {
    const cell = Comb.cells.find(c => c.id === window.__cellId);
    return { type: cell.type, amount: Math.round(cell.amount * 100) / 100 };
  });

  // --- 3. FEED: force a hungry larva, drop onto it with pollen, hold E ---
  await page.evaluate(() => {
    let c = Comb.cells.find(c => c.type === 'larva');
    if (!c) { c = Comb.cells.find(c => c.zone === 'brood'); c.type = 'larva'; c.age = 100; c.fed = 0; }
    c.built = true; c.hungry = true; c.hungerT = 200; c.fed = 0;
    window.__larvaId = c.id;
    const b = G.players[0].bee;
    b.x = c.x; b.y = c.y; b.vx = b.vy = 0; b.pollen = b.def.pollenCap || 6; b.nectar = 5; b.feedCd = 0;
    b.inside = true; b.layerCd = 999;   // inside, at the larva
  });
  const beforeFed = await page.evaluate(() => Comb.cells.find(c => c.id === window.__larvaId).fed);
  await page.keyboard.down('KeyE'); await page.waitForTimeout(600); await page.keyboard.up('KeyE');
  results.feed = await page.evaluate(() => {
    const c = Comb.cells.find(c => c.id === window.__larvaId);
    return { fedBefore: window.__bf, fed: c.fed, hungry: c.hungry };
  });
  results.feed.fedBefore = beforeFed;

  // --- starting honey level (after rebalance) ---
  results.startHoney = await page.evaluate(() => Math.round(G.hive.honeyUnits));

  await browser.close();
  console.log(JSON.stringify(results, null, 2));
  const ok = results.gather.nectar > 0 &&
             results.deposit.type !== 'empty' && results.deposit.amount > 0 &&
             results.feed.fed > results.feed.fedBefore &&
             errors.length === 0;
  console.log('ERRORS:', errors.length, errors.join('\n'));
  console.log(ok ? 'LOOP OK' : 'LOOP FAILED');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
