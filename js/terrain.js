// BIER -- terrain store: pixel materials, render canvas, collision.
// Bees fly, so this is mostly a static collision + paint layer. The comb that
// fills the hive cavity is drawn separately (see comb.js).
'use strict';

const T = {
  m: null,          // Uint8Array WORLD_W*WORLD_H
  surf: null,
  hive: null,
  terCan: null,     // cutaway view: materials with the cavity carved (cavity transparent)
  terCtx: null,
  extCan: null,     // exterior view: the trunk solid (cavity hidden behind bark)

  init(world) {
    this.m = world.m;
    this.surf = world.surf;
    this.hive = world.hive;
    this.buildCanvas();
    this.buildExtCanvas();
  },

  get(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= WORLD_W) return M_STONE;
    if (y < 0) return M_AIR;
    if (y >= WORLD_H) return M_STONE;
    return this.m[y * WORLD_W + x];
  },

  solid(x, y) { return this.get(x, y) !== M_AIR; },

  // outside the tree only the ground is solid -- the trunk and foliage are
  // background you fly in front of
  solidOut(x, y) {
    const m = this.get(x, y);
    return m === M_SOIL || m === M_GRASS || m === M_STONE;
  },

  // any solid pixel inside the box centered at (x,y), half-extents hw,hh.
  // `outside` true => use the ground-only ruleset.
  boxSolid(x, y, hw, hh, outside) {
    const x0 = Math.floor(x - hw), x1 = Math.ceil(x + hw);
    const y0 = Math.floor(y - hh), y1 = Math.ceil(y + hh);
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        if (outside ? this.solidOut(px, py) : this.solid(px, py)) return true;
      }
    }
    return false;
  },

  // remove a circle of soft material (wax/soil) -- used when a robber chews comb
  dig(cx, cy, r) {
    cx = Math.round(cx); cy = Math.round(cy);
    const r2 = r * r;
    let count = 0;
    const x0 = Math.max(0, cx - Math.ceil(r)), x1 = Math.min(WORLD_W - 1, cx + Math.ceil(r));
    const y0 = Math.max(0, cy - Math.ceil(r)), y1 = Math.min(WORLD_H - 1, cy + Math.ceil(r));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx, dy = y - cy;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * WORLD_W + x;
        const mat = this.m[i];
        if (mat === M_WAX || mat === M_SOIL || mat === M_GRASS) {
          this.m[i] = M_AIR;
          this.terCtx.clearRect(x, y, 1, 1);
          count++;
        }
      }
    }
    return count;
  },

  buildCanvas() {
    this.terCan = document.createElement('canvas');
    this.terCan.width = WORLD_W; this.terCan.height = WORLD_H;
    this.terCtx = this.terCan.getContext('2d');
    const img = this.terCtx.createImageData(WORLD_W, WORLD_H);
    const d = img.data;
    const m = this.m;
    for (let y = 0; y < WORLD_H; y++) {
      for (let x = 0; x < WORLD_W; x++) {
        const i = y * WORLD_W + x;
        const mat = m[i];
        if (mat === M_AIR) continue;
        const o = i * 4;
        const c = matColor(mat, x, y, pxHash(x, y));
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    this.terCtx.putImageData(img, 0, 0);
  },

  // The tree as seen from outside: a copy of the cutaway with the hive cavity
  // filled in by solid bark, so the comb is hidden -- save for a dark knothole.
  buildExtCanvas() {
    this.extCan = document.createElement('canvas');
    this.extCan.width = WORLD_W; this.extCan.height = WORLD_H;
    const ec = this.extCan.getContext('2d');
    ec.drawImage(this.terCan, 0, 0);

    const h = this.hive;
    if (!h) return;
    const { cavX0, cavY0, cavX1, cavY1 } = h, r = 22;
    const img = ec.getImageData(cavX0, cavY0, cavX1 - cavX0 + 1, cavY1 - cavY0 + 1);
    const d = img.data, w = img.width;
    for (let y = cavY0; y <= cavY1; y++) {
      for (let x = cavX0; x <= cavX1; x++) {
        // same rounded-rect mask the cavity was carved with
        const cx = x < cavX0 + r ? cavX0 + r : x > cavX1 - r ? cavX1 - r : x;
        const cy = y < cavY0 + r ? cavY0 + r : y > cavY1 - r ? cavY1 - r : y;
        if (cx !== x && cy !== y) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r * r) continue; }
        const c = matColor(M_WOOD, x, y, pxHash(x, y));
        const o = ((y - cavY0) * w + (x - cavX0)) * 4;
        d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
      }
    }
    ec.putImageData(img, cavX0, cavY0);

    // a dark knothole on the bark at the entrance
    const e = h.entrance;
    ec.fillStyle = '#241710';
    ec.beginPath(); ec.ellipse(e.x, e.y, 7, 9, 0, 0, Math.PI * 2); ec.fill();
    ec.fillStyle = '#3a2616';
    ec.beginPath(); ec.ellipse(e.x, e.y, 9, 11, 0, 0, Math.PI * 2); ec.fill();
    ec.fillStyle = '#1a0f08';
    ec.beginPath(); ec.ellipse(e.x, e.y, 6, 8, 0, 0, Math.PI * 2); ec.fill();
  }
};

function matColor(mat, x, y, h) {
  switch (mat) {
    case M_SOIL: {
      const shades = [[108, 74, 46], [96, 64, 40], [84, 56, 34], [100, 70, 44]];
      let c = shades[h % 4].slice();
      if (h % 29 === 0) c = [66, 44, 26];
      else if (h % 51 === 0) c = [128, 90, 58];
      return c;
    }
    case M_GRASS: {
      const shades = [[86, 150, 52], [70, 132, 42], [98, 166, 60], [62, 120, 40]];
      let c = shades[h % 4];
      if (h % 23 === 0) c = [120, 188, 74];
      return c;
    }
    case M_WOOD: {
      // vertical bark streaks
      const s = pxHash(x, (y >> 3) * 5) % 4;
      const shades = [[96, 66, 38], [82, 56, 32], [108, 76, 44], [74, 50, 28]];
      let c = shades[s];
      if (pxHash(x >> 2, y >> 5) % 13 === 0) c = [120, 86, 50]; // knot highlight
      return c;
    }
    case M_LEAF: {
      const shades = [[58, 122, 44], [46, 102, 35], [70, 140, 54], [40, 90, 32]];
      let c = shades[h % 4];
      if (h % 19 === 0) c = [92, 162, 68];
      else if (h % 37 === 0) c = [34, 78, 28];
      return c;
    }
    case M_STONE: {
      const shades = [[112, 110, 116], [97, 95, 102], [126, 124, 130]];
      let c = shades[h % 3];
      if (h % 31 === 0) c = [150, 148, 156];
      return c;
    }
    case M_WAX: {
      const shades = [[224, 182, 96], [208, 166, 84], [234, 196, 110]];
      return shades[h % 3];
    }
  }
  return [255, 0, 255];
}
