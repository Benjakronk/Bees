// BIER -- the honeycomb: a hex grid of wax cells filling the hive cavity.
// Cells are the living tissue of the colony -- honey stores, pollen, and the
// brood nest. Workers and the player dock to a cell and act on it.
'use strict';

// how much one full cell is worth, in colony units
const HONEY_PER_CELL = 6;
const POLLEN_PER_CELL = 4;
const RIPEN_TIME = 60 * 45;   // nectar -> capped honey (~45s of being full)

// brood timing (frames)
const EGG_TIME = 60 * 50;
const LARVA_TIME = 60 * 110;   // needs feeding during this
const PUPA_TIME = 60 * 90;
const LARVA_FEEDS = 3;

const Comb = {
  cells: [],
  buckets: null,
  BW: 24,
  bcols: 0,
  hive: null,

  init(hive, rng) {
    this.hive = hive;
    this.cells = [];
    const { cavX0, cavY0, cavX1, cavY1, broodCx, broodCy } = hive;
    const pitchX = 11, pitchY = 9.5;
    const inset = 8;
    let id = 1;
    let row = 0;
    for (let y = cavY0 + inset; y <= cavY1 - inset; y += pitchY, row++) {
      const off = (row % 2) * (pitchX / 2);
      for (let x = cavX0 + inset + off; x <= cavX1 - inset; x += pitchX) {
        // keep the comb inside the rounded cavity
        const cval = T.get(x, y);
        if (cval !== M_AIR) continue;
        const d = Math.hypot(x - broodCx, y - broodCy);
        let zone;
        if (d < 50) zone = 'brood';
        else if (d < 92) zone = 'pollen';
        else if (y < cavY0 + hive.CH * 0.46) zone = 'honey';
        else zone = (pxHash(x | 0, y | 0) % 3 === 0) ? 'pollen' : 'honey';
        // the hive starts as a small comb (brood + a little honey & pollen),
        // centred a touch above the brood so it spans into the honey zone;
        // everything beyond is built out over time
        const ds = Math.hypot(x - broodCx, (y - (broodCy - 30)) * 1.05);
        this.cells.push({
          id: id++, x: Math.round(x), y: Math.round(y), zone,
          built: ds < 62,
          type: 'empty', amount: 0, capped: false,
          age: 0, fed: 0, hungry: false, queen: false, nbrs: null,
        });
      }
    }
    this.buildBuckets();
    this.computeNeighbors();
    if (rng) this.seedStartingState(rng);
    // reset the cached render: origin and gradient are tied to this world/ctx
    this._can = null; this._cctx = null; this._waxGrad = null; this._dirty = true;
  },

  // each cell's adjacent cells (the six hex neighbours), for the build frontier
  computeNeighbors() {
    for (const c of this.cells) {
      c.nbrs = [];
      this.forEachNear(c.x, c.y, 14, o => { if (o !== c && dist2(c.x, c.y, o.x, o.y) < 169) c.nbrs.push(o); });
    }
  },

  buildBuckets() {
    this.bcols = Math.ceil(WORLD_W / this.BW);
    this.buckets = new Map();
    for (const c of this.cells) {
      const k = ((c.y / this.BW) | 0) * this.bcols + ((c.x / this.BW) | 0);
      let a = this.buckets.get(k);
      if (!a) this.buckets.set(k, a = []);
      a.push(c);
    }
  },

  // a freshly settled colony: some honey up top, pollen ring, a live brood nest
  seedStartingState(rng) {
    // the starting comb is small, so seed the brood core with grubs and the
    // surrounding storage ring with a honey/pollen mix (regardless of the
    // long-term zone label) so the young hive has a working reserve
    for (const c of this.cells) {
      if (!c.built) continue;
      const r = rng();
      if (c.zone === 'brood') {
        if (r < 0.5) {
          const s = rng();
          if (s < 0.3) { c.type = 'egg'; c.age = rng() * EGG_TIME; }
          else if (s < 0.72) { c.type = 'larva'; c.age = rng() * LARVA_TIME; c.fed = 1 + (rng() * 2 | 0); c.hungry = rng() < 0.3; }
          else { c.type = 'pupa'; c.age = rng() * PUPA_TIME; c.capped = true; }
        }
      } else {
        if (r < 0.42) { c.type = 'honey'; c.amount = 0.45 + rng() * 0.5; c.capped = c.amount > 0.78; }
        else if (r < 0.72) { c.type = 'pollen'; c.amount = 0.3 + rng() * 0.5; }
      }
    }
  },

  // ----- spatial queries ----------------------------------------------------
  forEachNear(x, y, r, fn) {
    const c0 = ((x - r) / this.BW) | 0, c1 = ((x + r) / this.BW) | 0;
    const r0 = ((y - r) / this.BW) | 0, r1 = ((y + r) / this.BW) | 0;
    for (let ry = r0; ry <= r1; ry++) {
      for (let cx = c0; cx <= c1; cx++) {
        const a = this.buckets.get(ry * this.bcols + cx);
        if (a) for (const c of a) fn(c);
      }
    }
  },

  // nearest cell to (x,y) within maxR, optional predicate
  nearest(x, y, maxR, pred) {
    let best = null, bd = maxR * maxR;
    this.forEachNear(x, y, maxR, c => {
      if (pred && !pred(c)) return;
      const dx = c.x - x, dy = c.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = c; }
    });
    return best;
  },

  cellAt(x, y, maxR) { return this.nearest(x, y, maxR || 7); },

  // an empty cell near a point, for the queen / nectar storage / building
  emptyNear(x, y, maxR, zone) {
    return this.nearest(x, y, maxR, c =>
      c.built && c.type === 'empty' && (!zone || c.zone === zone));
  },

  hungryLarvaNear(x, y, maxR) {
    return this.nearest(x, y, maxR, c => c.type === 'larva' && c.hungry);
  },

  // a store cell that still has room for more nectar
  nectarRoomNear(x, y, maxR) {
    return this.nearest(x, y, maxR, c => c.built && (
      (c.type === 'empty' && c.zone !== 'brood') ||
      ((c.type === 'honey' || c.type === 'nectar') && !c.capped && c.amount < 1)));
  },

  pollenRoomNear(x, y, maxR) {
    return this.nearest(x, y, maxR, c => c.built && (
      (c.type === 'empty' && c.zone !== 'brood') ||
      (c.type === 'pollen' && c.amount < 1)));
  },

  // ----- building (expanding the comb) --------------------------------------
  // an unbuilt cell adjacent to existing comb, nearest to (x,y)
  buildableNear(x, y, maxR) {
    return this.nearest(x, y, maxR, c =>
      !c.built && c.nbrs.some(n => n.built));
  },
  buildCell(c) {
    c.built = true; c.type = 'empty'; c.amount = 0; c.capped = false;
    this._dirty = true;
  },
  builtEmptyCount() {
    let n = 0;
    for (const c of this.cells) if (c.built && c.type === 'empty') n++;
    return n;
  },

  // ----- aggregate stats (cached by the hive) -------------------------------
  totals() {
    let honey = 0, pollen = 0, brood = 0, empty = 0, buildable = 0;
    for (const c of this.cells) {
      if (c.type === 'honey' || c.type === 'nectar') honey += c.amount;
      else if (c.type === 'pollen') pollen += c.amount;
      else if (c.type === 'egg' || c.type === 'larva' || c.type === 'pupa') brood++;
      else if (c.type === 'empty' && c.built) empty++;
      if (!c.built && c.nbrs && c.nbrs.some(n => n.built)) buildable++;
    }
    return {
      honeyUnits: honey * HONEY_PER_CELL,
      pollenUnits: pollen * POLLEN_PER_CELL,
      brood, empty, buildable,
    };
  },

  // drain `units` of honey, fullest cells first; returns units actually drained
  drainHoney(units) {
    let need = units;
    // simple pass: take from any honey/nectar cell
    for (const c of this.cells) {
      if (need <= 0) break;
      if (c.type !== 'honey' && c.type !== 'nectar') continue;
      const have = c.amount * HONEY_PER_CELL;
      const take = Math.min(have, need);
      c.amount -= take / HONEY_PER_CELL;
      need -= take;
      if (c.amount <= 0.001) { c.type = 'empty'; c.amount = 0; c.capped = false; }
    }
    return units - need;
  },

  drainPollen(units) {
    let need = units;
    for (const c of this.cells) {
      if (need <= 0) break;
      if (c.type !== 'pollen') continue;
      const have = c.amount * POLLEN_PER_CELL;
      const take = Math.min(have, need);
      c.amount -= take / POLLEN_PER_CELL;
      need -= take;
      if (c.amount <= 0.001) { c.type = 'empty'; c.amount = 0; }
    }
    return units - need;
  },

  // nectar slowly ripens to capped honey (called from hive.update)
  ripenStep() {
    for (const c of this.cells) {
      if (c.type === 'nectar') {
        c.age++;
        if (c.amount >= 0.98 && c.age > RIPEN_TIME) {
          c.type = 'honey'; c.capped = true;
        }
      }
    }
  },

  // ----- rendering ----------------------------------------------------------
  // The comb is hundreds of hex path-fills -- far too costly to redraw every
  // frame in a developed hive. Instead it is painted once into an offscreen
  // canvas covering the cavity and blitted each frame, re-rendered only on a
  // short cadence (cells change slowly). Live shimmer/blink ride on top as a
  // cheap per-frame overlay.
  _can: null, _cctx: null, _cox: 0, _coy: 0, _dirty: true, _lastRender: -999,

  // force a re-render on the next draw (after build / load / big changes)
  touch() { this._dirty = true; },

  ensureCanvas() {
    if (this._can) return;
    const h = this.hive, pad = 12;
    this._cox = h.cavX0 - pad; this._coy = h.cavY0 - pad;
    this._can = document.createElement('canvas');
    this._can.width = (h.cavX1 - h.cavX0) + pad * 2;
    this._can.height = (h.cavY1 - h.cavY0) + pad * 2;
    this._cctx = this._can.getContext('2d');
    this._dirty = true;
  },

  renderCanvas() {
    const g2 = this._cctx, h = this.hive;
    g2.clearRect(0, 0, this._can.width, this._can.height);
    // wax backdrop so air pockets never show through to the trunk cutaway
    const ww = h.cavX1 - h.cavX0, hh = h.cavY1 - h.cavY0;
    if (!this._waxGrad) {
      const g = g2.createLinearGradient(0, 0, 0, hh);
      g.addColorStop(0, '#4a3618'); g.addColorStop(1, '#2f2210');
      this._waxGrad = g;
    }
    g2.save();
    g2.translate(h.cavX0 - this._cox, h.cavY0 - this._coy);
    g2.fillStyle = this._waxGrad;
    g2.fillRect(0, 0, ww, hh);
    g2.restore();
    for (const c of this.cells) {
      const ex = c.x - this._cox, ey = c.y - this._coy;
      if (c.built) this.drawCell(g2, c, ex, ey);
      else if (c.nbrs && c.nbrs.some(n => n.built)) {
        g2.strokeStyle = 'rgba(210,180,110,0.28)';
        g2.lineWidth = 1;
        hexStroke(g2, ex, ey, 4.2);
      }
    }
    this._dirty = false;
    this._lastRender = G.tick;
  },

  draw(ctx, camx, camy, vw, vh) {
    this.ensureCanvas();
    if (this._dirty || G.tick - this._lastRender >= 8) this.renderCanvas();
    // blit the overlapping region of the comb canvas into the viewport
    let sx = camx - this._cox, sy = camy - this._coy, dx = 0, dy = 0, sw = vw, sh = vh;
    if (sx < 0) { dx = -sx; sw += sx; sx = 0; }
    if (sy < 0) { dy = -sy; sh += sy; sy = 0; }
    if (sx + sw > this._can.width) sw = this._can.width - sx;
    if (sy + sh > this._can.height) sh = this._can.height - sy;
    if (sw > 0 && sh > 0) ctx.drawImage(this._can, sx, sy, sw, sh, dx, dy, sw, sh);
    // live overlay: nectar shimmer + hungry-larva blink (a few cells, per frame)
    for (const c of this.cells) {
      if (!c.built) continue;
      const ex = c.x - camx, ey = c.y - camy;
      if (ex < -6 || ex > vw + 6 || ey < -6 || ey > vh + 6) continue;
      if (c.type === 'nectar') { if (G.tick >> 3 & 1) { ctx.fillStyle = '#ffe27a'; ctx.fillRect(ex - 1, ey - 1, 1, 1); } }
      else if (c.type === 'larva' && c.hungry && (G.tick >> 4 & 1)) { ctx.fillStyle = '#ff6050'; ctx.fillRect(ex, ey - 5, 1, 1); }
    }
  },

  drawCell(ctx, c, ex, ey) {
    // pocket interior (dark wax pocket); content is drawn on top
    ctx.fillStyle = '#43331c';
    hex(ctx, ex, ey, 4.4);
    if (c.type === 'honey' || c.type === 'nectar') {
      const a = c.amount;
      const lit = c.type === 'nectar';
      ctx.fillStyle = lit ? '#e6b43c' : '#e2a828';
      hex(ctx, ex, ey, 1.6 + a * 2.8);
      if (c.capped) {
        ctx.fillStyle = '#d8b86a';   // wax cap
        hex(ctx, ex, ey, 4.0);
        ctx.fillStyle = '#c2a050';
        ctx.fillRect(ex - 1, ey - 1, 2, 1);
      } else if (a > 0.4) {
        ctx.fillStyle = '#ffd862';   // shine
        ctx.fillRect(ex - 1, ey - 1, 1, 1);
      }
    } else if (c.type === 'pollen') {
      const cols = ['#e8a02c', '#d8c040', '#e07028', '#c8b850'];
      const n = 2 + Math.round(c.amount * 4);
      for (let i = 0; i < n; i++) {
        const hh = pxHash(c.id * 7 + i, c.id);
        ctx.fillStyle = cols[hh % cols.length];
        ctx.fillRect(ex - 2 + (hh % 4), ey - 2 + ((hh >> 3) % 4), 1, 1);
      }
    } else if (c.type === 'egg') {
      ctx.fillStyle = '#f0ecd8';
      ctx.fillRect(ex, ey - 1, 1, 3);
    } else if (c.type === 'larva') {
      const grow = Math.min(1, c.age / LARVA_TIME);
      ctx.fillStyle = '#f2ecd2';
      const r = 1 + grow * 2.4;
      hex(ctx, ex, ey, r);
      ctx.fillStyle = '#dcd2ae';
      ctx.fillRect(ex - 1, ey, 1, 1);
    } else if (c.type === 'pupa') {
      ctx.fillStyle = '#caa463';   // brown wax cap over a developing bee
      hex(ctx, ex, ey, 4.0);
      ctx.fillStyle = '#b08a4c';
      ctx.fillRect(ex - 1, ey - 1, 2, 2);
    }
  },

  // ----- save / load --------------------------------------------------------
  serialize() {
    // pack as a compact array of [type,amount(0..255),flags,age]
    return this.cells.map(c => ({
      t: c.type, a: Math.round(c.amount * 255), c: c.capped ? 1 : 0,
      g: c.age, f: c.fed, h: c.hungry ? 1 : 0, b: c.built ? 1 : 0, q: c.queen ? 1 : 0,
    }));
  },
  load(arr) {
    if (!arr || arr.length !== this.cells.length) return;
    for (let i = 0; i < this.cells.length; i++) {
      const s = arr[i], c = this.cells[i];
      c.type = s.t; c.amount = s.a / 255; c.capped = !!s.c;
      c.age = s.g; c.fed = s.f; c.hungry = !!s.h;
      c.built = s.b === undefined ? true : !!s.b;
      c.queen = !!s.q;
    }
    this._dirty = true;
  },
};

// hexagon path centered at (x,y), radius r (pointy-top)
function hexPath(ctx, x, y, r) {
  x = Math.round(x); y = Math.round(y);
  const w = Math.round(r), hgt = Math.round(r * 0.9);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + w, y - hgt * 0.5);
  ctx.lineTo(x + w, y + hgt * 0.5);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - w, y + hgt * 0.5);
  ctx.lineTo(x - w, y - hgt * 0.5);
  ctx.closePath();
}
function hex(ctx, x, y, r) { if (r <= 0) return; hexPath(ctx, x, y, r); ctx.fill(); }
function hexStroke(ctx, x, y, r) { if (r <= 0) return; hexPath(ctx, x, y, r); ctx.stroke(); }
