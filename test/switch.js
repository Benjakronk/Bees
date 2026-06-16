// BIER switch test -- verifies the voluntary "switch to another bee" feature:
// Tab opens the cancellable overlay, Enter hands control to the chosen bee and
// releases the old one, Esc cancels. Also captures the SWITCH BEE overlay.
'use strict';
const path = require('path');
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
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(300);
  const press = async (k, ms = 110) => { await page.keyboard.press(k); await page.waitForTimeout(ms); };
  await press('Enter');               // START
  await press('Enter');               // HIVE 1, 1 player
  await page.waitForTimeout(300);
  await press('Space');               // intro -> play
  await page.waitForTimeout(200);

  const before = await page.evaluate(() => ({ id: G.players[0].bee.id, free: G.bees.filter(b => b.hp > 0 && b.playerIdx < 0).length }));

  // --- open the switch overlay (Tab) and screenshot it ---
  await press('Tab');
  const opened = await page.evaluate(() => ({ state: G.state, isSwitch: !!(G.takeover && G.takeover.prevBee), n: G.takeover ? G.takeover.list.length : 0 }));
  await page.locator('#game').screenshot({ path: path.join(__dirname, 'shot-switch.png') });

  // --- pick the 2nd candidate (Enter) ---
  await press('ArrowDown');
  await press('Enter');
  const after = await page.evaluate(() => ({
    state: G.state, id: G.players[0].bee.id,
    prevReleased: true, controlled: G.bees.filter(b => b.playerIdx === 0).length,
  }));

  // --- cancel path: open then Esc keeps the same bee ---
  const idNow = await page.evaluate(() => G.players[0].bee.id);
  await press('Tab');
  await press('Escape');
  const cancelled = await page.evaluate(() => ({ state: G.state, id: G.players[0].bee.id }));

  console.log('OPEN overlay   :', opened.state === 'dead' && opened.isSwitch && opened.n > 0 ? 'OK' : 'FAIL ' + JSON.stringify(opened));
  console.log('SWITCHED bee   :', (after.state === 'play' && after.id !== before.id && after.controlled === 1) ? 'OK' : 'FAIL ' + JSON.stringify({ before, after }));
  console.log('CANCEL keeps   :', (cancelled.state === 'play' && cancelled.id === idNow) ? 'OK' : 'FAIL ' + JSON.stringify(cancelled));
  console.log('ERRORS', errors.length, errors.slice(0, 3).join(' | '));
  await browser.close();
})();
