// BIER -- capture a few framed screenshots for visual review.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '..', '..', 'Ants', 'node_modules', 'playwright'));
const INDEX = path.resolve(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  await page.goto(pathToFileURL(INDEX).href);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-title.png') });

  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  await page.keyboard.press('Space'); await page.waitForTimeout(400);

  // park the player in the middle of the comb to show the hive interior
  await page.evaluate(() => {
    const h = Comb.hive; const b = G.players[0].bee;
    b.x = h.broodCx; b.y = h.broodCy - 30; b.vx = b.vy = 0;
    G.players[0].cam.x = b.x - 160; G.players[0].cam.y = b.y - 88;
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-hive.png') });

  // park outside by the meadow flowers
  await page.evaluate(() => {
    const f = G.flowers.find(f => f.bloomLevel() > 0.4) || G.flowers[0];
    const b = G.players[0].bee;
    b.x = f.x; b.y = f.y - 24; b.vx = b.vy = 0;
    G.players[0].cam.x = b.x - 160; G.players[0].cam.y = b.y - 88;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-meadow.png') });

  // zoom out view of the whole tree: move camera, draw one frame
  await page.evaluate(() => {
    const h = Comb.hive; const b = G.players[0].bee;
    b.x = h.x + h.trunkHalf + 80; b.y = h.entrance.y; b.vx = b.vy = 0;
    G.players[0].cam.x = h.x - 220; G.players[0].cam.y = h.cavY0 - 90;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.resolve(__dirname, 'shot-tree.png') });

  await browser.close();
  console.log('shots written');
})().catch(e => { console.error(e); process.exit(1); });
