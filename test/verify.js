// BIER verify -- exercises the new features and captures screenshots:
//  - English + Norwegian title menus (language pack)
//  - 2-player horizontal vs vertical split (split-screen option)
//  - the iris-wipe knothole transition (asserts the layer actually swaps)
'use strict';
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const PW = path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright');
const { chromium } = require(PW);
const INDEX = path.resolve(__dirname, '..', 'index.html');

(async () => {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // start from a known language so the run is deterministic
  await page.addInitScript(() => { try { localStorage.removeItem('bier_lang'); localStorage.removeItem('bier_split'); } catch (e) {} });
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(400);

  const el = () => page.locator('#game');
  const shot = async name => { await el().screenshot({ path: path.join(__dirname, name) }); };
  const press = async (k, ms = 110) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };

  // --- title in English ---
  await shot('shot-title-en.png');

  // --- toggle to Norwegian (LANGUAGE is the 5th menu item) and back-render ---
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown'); // -> LANGUAGE
  await press('Enter');                 // toggle EN -> NO
  await page.waitForTimeout(120);
  await shot('shot-title-no.png');
  const langNo = await page.evaluate(() => LANG);

  // back to English for the rest
  await press('Enter');                 // toggle NO -> EN
  await page.evaluate(() => { G.menuSel = 0; });

  // --- 2-player game, default (horizontal) split ---
  await press('Enter');                 // START GAME
  await press('KeyT');                  // HIVE 1, 2 players
  await page.waitForTimeout(300);
  await press('Space');                 // intro -> play
  await page.waitForTimeout(300);
  await shot('shot-2p-horizontal.png');

  // --- toggle to vertical split via the pause menu (item 'split' = index 3) ---
  await press('Escape');                // pause
  await press('ArrowDown'); await press('ArrowDown'); await press('ArrowDown'); // -> SPLIT
  await press('Enter');                 // toggle horizontal -> vertical
  await press('Escape');                // resume
  await page.waitForTimeout(200);
  await shot('shot-2p-vertical.png');
  const splitVert = await page.evaluate(() => G.splitVert);

  // --- iris transition: drive player 0 to the inner gate and let it fire ---
  const transition = await page.evaluate(() => {
    const p = G.players[0], b = p.bee, h = G.hg;
    p.trans = null; b.inside = true; b.layerCd = 0;
    b.x = h.inner.x; b.y = h.inner.y; b.vx = b.vy = 0;
    let started = false, midFrame = false;
    const startedInside = b.inside;
    for (let i = 0; i < 80; i++) {
      updatePlay();
      const tr = G.players[0].trans;
      if (tr) { started = true; if (tr.phase === 'close' && tr.t >= 4 && !midFrame) { drawPlay(); midFrame = true; break; } }
    }
    return { started, startedInside };
  });
  await shot('shot-iris-mid.png');      // captured mid-close iris

  const crossed = await page.evaluate(() => {
    for (let i = 0; i < 120; i++) { updatePlay(); if (!G.players[0].trans) break; }
    return { inside: G.players[0].bee.inside, transClear: !G.players[0].trans };
  });

  console.log('LANG no toggle  :', langNo === 1 ? 'OK' : 'FAIL (' + langNo + ')');
  console.log('SPLIT vertical  :', splitVert === true ? 'OK' : 'FAIL');
  console.log('IRIS started    :', transition.started ? 'OK' : 'FAIL');
  console.log('IRIS crossed out:', (transition.startedInside && crossed.inside === false && crossed.transClear) ? 'OK' : 'FAIL ' + JSON.stringify(crossed));
  console.log('ERRORS', errors.length, errors.slice(0, 3).join(' | '));
  console.log('shots: shot-title-en, shot-title-no, shot-2p-horizontal, shot-2p-vertical, shot-iris-mid');
  await browser.close();
})();
