// BIER -- seeded procedural world generation.
// One byte per world pixel, Liero-style. A meadow with a great hollow bee-tree.
'use strict';

const WORLD_W = 2560;
const WORLD_H = 1280;

// materials
const M_AIR   = 0;
const M_SOIL  = 1;   // ground (solid)
const M_GRASS = 2;   // grass skin (solid)
const M_WOOD  = 3;   // tree trunk / branches (solid)
const M_LEAF  = 4;   // canopy foliage (solid mass)
const M_WAX   = 5;   // comb wax wall (solid) -- mostly drawn by comb.js
const M_STONE = 6;   // rocks (solid)

function SOLID(m) { return m !== M_AIR; }

// --- seeded rng -------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  str = String(str);
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// integer pixel hash, for per-pixel color jitter (deterministic, not rng-state)
function pxHash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// --- 1d value noise for the surface -----------------------------------------
function makeNoise1D(rng, cells) {
  const vals = new Float32Array(cells + 2);
  for (let i = 0; i < vals.length; i++) vals[i] = rng();
  return function (x) {
    const i = Math.floor(x), f = x - i;
    const a = vals[((i % cells) + cells) % cells];
    const b = vals[(((i + 1) % cells) + cells) % cells];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

// flower kinds, in the meadow
const FLOWER_KINDS = ['clover', 'daisy', 'poppy', 'lavender', 'dandelion', 'bluebell'];

// --- world generation --------------------------------------------------------
// returns { m, surf, hive, flowers, decor }
function genWorld(seed) {
  const rng = mulberry32(seed);
  const m = new Uint8Array(WORLD_W * WORLD_H);
  const surf = new Int16Array(WORLD_W);   // meadow surface (ground top)

  // -- surface heightmap: gently rolling meadow around y=820
  const n1 = makeNoise1D(rng, 48), n2 = makeNoise1D(rng, 48), n3 = makeNoise1D(rng, 48);
  const BASE = 820;
  for (let x = 0; x < WORLD_W; x++) {
    let h = BASE;
    h += (n1(x / 260) - 0.5) * 90;
    h += (n2(x / 70) - 0.5) * 26;
    h += (n3(x / 16) - 0.5) * 5;
    surf[x] = Math.round(h);
  }

  // the bee-tree sits near the middle; flatten the ground a little under it
  const treeX = Math.floor(WORLD_W / 2 + (rng() - 0.5) * 160);
  const baseY = surf[treeX];
  for (let x = treeX - 150; x <= treeX + 150; x++) {
    if (x < 0 || x >= WORLD_W) continue;
    const t = Math.abs(x - treeX) / 150;
    surf[x] = Math.round(baseY * (1 - t) + surf[x] * t);
  }

  // -- fill ground: soil with a grass skin, grass blades, pebbles
  for (let x = 0; x < WORLD_W; x++) {
    const s = surf[x];
    for (let y = Math.max(0, s); y < WORLD_H; y++) {
      m[y * WORLD_W + x] = (y < s + 4) ? M_GRASS : M_SOIL;
    }
    if (pxHash(x, 7) % 6 === 0 && Math.abs(x - treeX) > 130) {
      const bh = 1 + (pxHash(x, 13) % 4);
      for (let y = s - bh; y < s; y++) if (y >= 0) m[y * WORLD_W + x] = M_GRASS;
    }
  }
  // stony floor at the very bottom
  for (let x = 0; x < WORLD_W; x++)
    for (let y = WORLD_H - 8; y < WORLD_H; y++) m[y * WORLD_W + x] = M_STONE;
  // a few buried rocks
  for (let i = 0; i < 60; i++) {
    const bx = Math.floor(rng() * WORLD_W);
    const by = Math.floor(surf[bx] + 40 + rng() * (WORLD_H - surf[bx] - 80));
    fillEllipse(m, bx, by, 6 + rng() * 16, 4 + rng() * 9, M_STONE);
  }

  // ===========================================================================
  // THE BEE-TREE: a great hollow oak. Trunk, roots, branches, canopy, then a
  // cavity carved into the trunk holding the comb, with a knothole entrance.
  // ===========================================================================
  const groundY = surf[treeX];
  const CW = 176, CH = 372;                 // cavity inner size
  const wall = 17;                          // wood wall thickness around cavity
  const trunkHalf = CW / 2 + wall;          // ~105
  const cavY1 = groundY - 34;               // cavity floor (just above ground)
  const cavY0 = cavY1 - CH;                 // cavity ceiling
  const cavX0 = treeX - CW / 2, cavX1 = treeX + CW / 2;

  // trunk: a tall wood column from below ground up past the cavity
  const trunkTop = cavY0 - 70;
  for (let y = trunkTop; y < groundY + 26; y++) {
    // gentle barrel: a touch wider at the base
    const widen = Math.max(0, (y - (groundY - 120)) / 140) * 10;
    const hw = trunkHalf + widen;
    for (let x = treeX - hw; x <= treeX + hw; x++) setPx(m, Math.round(x), y, M_WOOD);
  }
  // root flare spreading into the soil
  for (let r = 0; r < 7; r++) {
    let rx = treeX + (rng() - 0.5) * trunkHalf * 1.6, ry = groundY + 4;
    let ra = Math.PI / 2 + (rng() - 0.5) * 1.5;
    const rl = 40 + rng() * 90, rw0 = 5 + rng() * 4;
    for (let s = 0; s < rl; s++) {
      const rw = Math.max(1, rw0 * (1 - s / rl));
      fillEllipse(m, Math.round(rx), Math.round(ry), rw, rw, M_WOOD);
      ra += (rng() - 0.5) * 0.3;
      rx += Math.cos(ra) * 2; ry += Math.sin(ra) * 2;
    }
  }
  // branches reaching up and out from above the cavity
  const branchTips = [];
  for (let b = 0; b < 6; b++) {
    const side = b % 2 === 0 ? -1 : 1;
    let bx = treeX + side * trunkHalf * 0.5;
    let by = trunkTop + 30 + rng() * 50;
    let ba = -Math.PI / 2 + side * (0.5 + rng() * 0.5);
    const bl = 60 + rng() * 80, bw0 = 5 + rng() * 4;
    for (let s = 0; s < bl; s++) {
      const bw = Math.max(1, bw0 * (1 - s / bl * 0.7));
      fillEllipse(m, Math.round(bx), Math.round(by), bw, bw, M_WOOD);
      ba += (rng() - 0.5) * 0.25 + (-Math.PI / 2 - ba) * 0.02;
      bx += Math.cos(ba) * 2.4; by += Math.sin(ba) * 2.4;
    }
    branchTips.push({ x: bx, y: by });
  }
  // canopy: big leaf puffs over the crown and branch tips
  let canopyTop = trunkTop;
  const crownY = trunkTop - 30;
  for (let i = 0; i < 22; i++) {
    const px = treeX + (rng() - 0.5) * 360;
    const py = crownY - rng() * 150;
    const rx = 34 + rng() * 30, ry = 26 + rng() * 22;
    fillEllipse(m, Math.round(px), Math.round(py), rx, ry, M_LEAF, true);
    if (py - ry < canopyTop) canopyTop = py - ry;
  }
  for (const t of branchTips) {
    fillEllipse(m, Math.round(t.x), Math.round(t.y), 28 + rng() * 18, 22 + rng() * 14, M_LEAF, true);
  }

  // carve the cavity (rounded rectangle) back to air
  carveRoundRect(m, cavX0, cavY0, cavX1, cavY1, 22);

  // the knothole entrance: a short tunnel through one trunk wall near the floor.
  // It must sit ON the bark, so derive the trunk's real half-width at this
  // height (the trunk barrels out near the base) and place the hole just inside
  // that surface -- otherwise the knothole floats out in the air beside the trunk.
  const entSide = rng() < 0.5 ? -1 : 1;
  const entY = cavY1 - 46;
  const innerX = treeX + entSide * (CW / 2 - 6);
  const trunkHwAtEnt = trunkHalf + Math.max(0, (entY - (groundY - 120)) / 140) * 10;
  const outerX = treeX + entSide * (trunkHwAtEnt - 6);
  carveTunnel(m, innerX, entY, outerX, entY, 9);
  // a little landing lip jutting out below the hole
  for (let s = 0; s <= 12; s++) {
    const x = Math.round(outerX + entSide * s);
    setPx(m, x, entY + 11, M_WOOD); setPx(m, x, entY + 12, M_WOOD);
  }

  // door geometry for the inside/outside layer transition:
  //  entrance  - the knothole on the trunk surface (outside bees aim here to enter)
  //  inner     - just inside the hole (inside bees aim here to leave)
  //  dropIn    - where a bee lands after entering (deep enough not to bounce out)
  //  dropOut   - where a bee lands after leaving
  const entrance = { x: outerX, y: entY };
  const inner    = { x: innerX - entSide * 14, y: entY };
  const dropIn   = { x: innerX - entSide * 34, y: entY };
  const dropOut  = { x: outerX + entSide * 26, y: entY - 8 };
  const outer    = { x: outerX + entSide * 18, y: entY - 6 };
  const hive = {
    x: treeX, treeX,
    cavX0, cavY0, cavX1, cavY1, CW, CH, trunkHalf,
    entrance, inner, outer, dropIn, dropOut, entSide, entY,
    // brood nest sits in the lower-middle of the comb; honey above; pollen ring
    broodCx: treeX, broodCy: cavY0 + CH * 0.62,
    canopyTop: Math.round(canopyTop),
    trunkTop,
  };

  // ===========================================================================
  // THE MEADOW: flowers across the ground, clustered into patches, away from
  // the trunk. Plus background decor (distant hills handled in main).
  // ===========================================================================
  const flowers = [];
  const patches = 18 + Math.floor(rng() * 8);
  for (let p = 0; p < patches; p++) {
    const cx = 60 + rng() * (WORLD_W - 120);
    if (Math.abs(cx - treeX) < trunkHalf + 50) continue;   // not under the trunk
    const kind = FLOWER_KINDS[Math.floor(rng() * FLOWER_KINDS.length)];
    const n = 2 + Math.floor(rng() * 5);
    for (let i = 0; i < n; i++) {
      const fx = Math.max(20, Math.min(WORLD_W - 20, Math.round(cx + (rng() - 0.5) * 70)));
      if (Math.abs(fx - treeX) < trunkHalf + 30) continue;
      flowers.push({ x: fx, y: surf[fx] - 1, kind });
    }
  }
  // guarantee a starter patch within easy reach of the entrance on each side
  for (const dir of [-1, 1]) {
    const cx = treeX + dir * (trunkHalf + 120 + rng() * 80);
    const kind = FLOWER_KINDS[Math.floor(rng() * FLOWER_KINDS.length)];
    for (let i = 0; i < 4; i++) {
      const fx = Math.max(20, Math.min(WORLD_W - 20, Math.round(cx + (rng() - 0.5) * 60)));
      flowers.push({ x: fx, y: surf[fx] - 1, kind });
    }
  }

  return { m, surf, hive, flowers, treeX };
}

// --- gen helpers --------------------------------------------------------------
function setPx(m, x, y, v) {
  if (x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H) m[y * WORLD_W + x] = v;
}
function setPxIf(m, x, y, v, onlyIf) {
  if (x >= 0 && x < WORLD_W && y >= 0 && y < WORLD_H) {
    const i = y * WORLD_W + x;
    if (m[i] === onlyIf) m[i] = v;
  }
}
function fillEllipse(m, cx, cy, rx, ry, v, onlyAir) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        if (onlyAir) setPxIf(m, x, y, v, M_AIR);
        else setPx(m, x, y, v);
      }
    }
  }
}
function carveEllipse(m, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(m, x, y, M_AIR);
    }
  }
}
function carveRoundRect(m, x0, y0, x1, y1, r) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // rounded corners
      let ok = true;
      const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
      const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
      if (cx !== x && cy !== y) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r * r) ok = false;
      }
      if (ok) setPx(m, x, y, M_AIR);
    }
  }
}
function carveTunnel(m, x0, y0, x1, y1, r) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(dist / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    carveEllipse(m, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r);
  }
}
