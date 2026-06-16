// BIER -- entities: bees, flowers, threats. Flight + AI + pixel sprites.
'use strict';

let ENT_ID = 1;

const CASTE = {
  worker: { hp: 18, dmg: 4, speed: 1.9, accel: 0.34, size: 1.0,  color: [232, 176, 56], nectarCap: 10, pollenCap: 6 },
  guard:  { hp: 32, dmg: 9, speed: 2.2, accel: 0.44, size: 1.2,  color: [210, 150, 44], nectarCap: 4,  pollenCap: 0 },
  drone:  { hp: 24, dmg: 3, speed: 1.6, accel: 0.30, size: 1.3,  color: [120, 96, 48],  nectarCap: 4,  pollenCap: 0 },
  queen:  { hp: 90, dmg: 6, speed: 1.0, accel: 0.18, size: 1.9,  color: [200, 138, 60], nectarCap: 0,  pollenCap: 0 },
};

// what each caste can do when the player is flying it -- this is where the
// castes feel different:
//  worker -- the all-rounder: forage, build comb, feed, modest sting
//  guard  -- the soldier: long reach, hard knockback, a lunging dash; no work
//  drone  -- husky bruiser: heavy body-check knockback, can't work or forage
//  queen  -- lays eggs in empty brood cells; can't forage/build
const CAP = {
  worker: { canForage: true,  canBuild: true,  canFeed: true,  canLay: false, reach: 16, knock: 1.2, stingCd: 22, dash: false },
  guard:  { canForage: false, canBuild: false, canFeed: false, canLay: false, reach: 24, knock: 2.6, stingCd: 16, dash: true },
  drone:  { canForage: false, canBuild: false, canFeed: false, canLay: false, reach: 20, knock: 3.2, stingCd: 40, dash: false },
  queen:  { canForage: false, canBuild: false, canFeed: true,  canLay: true,  reach: 16, knock: 1.4, stingCd: 30, dash: false },
};

// --- shared flight physics --------------------------------------------------
const FLY_DRAG = 0.90;

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

// inside the hive cavity?
function inCavity(x, y) {
  const h = Comb.hive;
  if (!h) return false;
  return x > h.cavX0 - 6 && x < h.cavX1 + 6 && y > h.cavY0 - 6 && y < h.cavY1 + 6;
}

function flyStep(e) {
  const out = !e.inside;   // outside the tree, only the ground is solid
  e.vx *= FLY_DRAG; e.vy *= FLY_DRAG;
  const sp = Math.hypot(e.vx, e.vy);
  if (sp > e.maxSpeed) { const k = e.maxSpeed / sp; e.vx *= k; e.vy *= k; }
  e.blocked = false;
  const nx = e.x + e.vx;
  if (!T.boxSolid(nx, e.y, e.hw, e.hh, out)) e.x = nx;
  else { e.vx *= -0.25; e.blocked = true; }
  const ny = e.y + e.vy;
  if (!T.boxSolid(e.x, ny, e.hw, e.hh, out)) e.y = ny;
  else { e.vy *= -0.25; e.blocked = true; }
  // embedded? nudge toward open air
  if (T.boxSolid(e.x, e.y, e.hw, e.hh, out)) {
    for (let r = 1; r <= 6; r++) {
      let done = false;
      for (const o of [[0, -r], [r, 0], [-r, 0], [0, r], [r, -r], [-r, -r], [r, r], [-r, r]]) {
        if (!T.boxSolid(e.x + o[0], e.y + o[1], e.hw, e.hh, out)) { e.x += o[0]; e.y += o[1]; done = true; break; }
      }
      if (done) break;
    }
  }
  e.x = clamp(e.x, 8, WORLD_W - 8);
  e.y = clamp(e.y, 8, WORLD_H - 8);
}

// move an NPC flier between the outside world and the hive interior through the
// knothole. NPCs transition by intent (e.wantInside) so a bee working the comb
// never accidentally drifts back out. (The player crosses via the animated iris
// in updateHiveTransition; player bees never call this.)
function crossDoor(e) {
  const h = Comb.hive;
  if (e.layerCd > 0) { e.layerCd--; return; }
  if (!e.inside && e.wantInside && dist2(e.x, e.y, h.entrance.x, h.entrance.y) < 196) {
    e.inside = true; e.x = h.dropIn.x; e.y = h.dropIn.y; e.vx *= 0.3; e.vy *= 0.3; e.layerCd = 20;
  } else if (e.inside && !e.wantInside && dist2(e.x, e.y, h.inner.x, h.inner.y) < 196) {
    e.inside = false; e.x = h.dropOut.x; e.y = h.dropOut.y; e.vx *= 0.3; e.vy *= 0.3; e.layerCd = 20;
  }
}

// ---------------------------------------------------------------------------
// Bee
// ---------------------------------------------------------------------------
class Bee {
  constructor(x, y, caste) {
    this.id = ENT_ID++;
    this.kind = 'bee';
    this.caste = caste;
    const c = CASTE[caste];
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.hw = 2.5 * c.size; this.hh = 1.8 * c.size;
    this.maxSpeed = c.speed;
    this.hp = c.hp; this.maxHp = c.hp;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * 10;
    this.wing = Math.random() * 10;
    this.playerIdx = -1;
    this.state = 'idle';
    this.stateT = 30 + Math.random() * 120;
    this.target = null;
    this.nectar = 0; this.pollen = 0;
    this.feedLoad = 0;       // nurse's jelly load
    this.stingCd = 0;
    this.flash = 0;
    this.inside = inCavity(x, y);   // which layer: hive interior vs open air
    this.wantInside = this.inside;  // which layer the bee currently wants to be on
    this.layerCd = 0;
    this.wanderA = Math.random() * Math.PI * 2;
    this.homeT = 0;
    this.storeT = 0;
    this.buildT = 0;
  }

  get def() { return CASTE[this.caste]; }

  hurt(dmg, kx, ky) {
    this.hp -= dmg;
    this.flash = 6;
    this.vx += kx || 0; this.vy += (ky || 0);
    G.particles.blood(this.x, this.y, 3);
    if (G.nearPlayer(this.x, this.y) < 220) Sfx.play('hurt');
    if (this.playerIdx < 0 && this.caste === 'worker' && this.state !== 'guard') {
      this.state = 'flee'; this.stateT = 90;
    }
  }

  update() {
    if (this.flash > 0) this.flash--;
    if (this.stingCd > 0) this.stingCd--;
    this.wing += 0.9;
    this.phase += 0.1 + Math.hypot(this.vx, this.vy) * 0.05;

    // player bees cross the knothole via the animated iris transition, driven
    // from updatePlay (see updateHiveTransition); NPCs snap through instantly
    if (this.playerIdx >= 0) { flyStep(this); return; }
    this.npcThink();
    flyStep(this);
    crossDoor(this);
  }

  // steer (accelerate) toward a point; returns distance
  goTo(tx, ty, accel) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    const a = accel != null ? accel : this.def.accel;
    this.vx += dx / d * a;
    this.vy += dy / d * a;
    if (Math.abs(dx) > 1.5) this.dir = dx > 0 ? 1 : -1;
    return d;
  }

  // fly toward a target on a given layer, routing to the knothole when the
  // bee must change layers (crossDoor() does the actual transition on arrival)
  flyTo(tx, ty, accel, destInside) {
    if (destInside === undefined) destInside = inCavity(tx, ty);
    if (this.inside !== destInside) {
      const h = Comb.hive;
      const gate = this.inside ? h.inner : h.entrance;
      this.goTo(gate.x, gate.y, accel);
      return Math.hypot(tx - this.x, ty - this.y);
    }
    return this.goTo(tx, ty, accel);
  }

  loaded() {
    const c = this.def;
    // stay out until the nectar crop is mostly full (honey is the lifeblood);
    // a full pollen load only sends us home once we also have decent nectar
    return this.nectar >= c.nectarCap - 0.5 ||
           (this.nectar >= c.nectarCap * 0.55 && c.pollenCap > 0 && this.pollen >= c.pollenCap - 0.3);
  }

  npcThink() {
    const Hv = G.hive;
    // by default a bee wants to be in the hive; foraging / outdoor combat flips
    // this so the door transition knows the bee's intent (set per state below)
    this.wantInside = true;

    // threat response (non-guards flee, guards/queen stand)
    const threat = G.nearestThreat(this.x, this.y, this.caste === 'guard' ? 150 : 64);
    if (threat) {
      if (this.caste === 'guard') { this.state = 'fight'; this.target = threat; }
      else if (this.caste !== 'queen' && this.state !== 'fight' && this.state !== 'flee') {
        this.state = 'flee'; this.stateT = 80;
      }
    }

    switch (this.state) {
      case 'idle': {
        this.stateT--;
        // gentle hover drift
        this.wanderA += (Math.random() - 0.5) * 0.6;
        this.goTo(this.x + Math.cos(this.wanderA) * 8, this.y + Math.sin(this.wanderA) * 8, this.def.accel * 0.25);
        if (this.stateT <= 0) {
          if (this.caste === 'queen') { this.state = 'queen'; this.stateT = 300; }
          else if (this.caste === 'drone') { this.state = 'drone'; this.stateT = 400; }
          else if (this.caste === 'guard') { this.state = 'guard'; this.stateT = 500; }
          else {
            // worker: nurse a hungry grub (small minority), else forage on
            // demand. When the larder is full, most bees rest instead -- the
            // economy self-regulates around the hive's honey target.
            const wantNurse = Hv && Hv.needNurses() && Comb.hungryLarvaNear(Comb.hive.broodCx, Comb.hive.broodCy, 9999);
            if (wantNurse && this.id % 4 === 0) { this.state = 'nurse'; this.target = null; }
            else if (Hv && Hv.wantBuild() && this.id % 3 === 1) { this.state = 'build'; this.target = null; }
            else if (!Hv || Math.random() < Hv.foragingDrive()) { this.state = 'forage'; this.target = null; }
            else { this.stateT = 120 + Math.random() * 240; }  // rest in the hive
          }
        }
        break;
      }

      case 'forage': {
        this.wantInside = false;   // out to the meadow
        if (this.loaded()) { this.state = 'store'; this.target = null; break; }
        // pick a flower with stock
        if (!this.target || this.target.dead || (this.target.nectar < 0.5 && this.target.pollen < 0.5)) {
          this.target = G.pickFlower(this.x);
          if (!this.target) { this.state = 'store'; break; }   // nothing blooming: go home
        }
        const f = this.target;
        const d = this.flyTo(f.x, f.y - 4, this.def.accel);
        if (d < 12) {
          const wantPollen = !G.hive || !G.hive.pollenSated();
          const got = f.harvest(0.18, wantPollen ? 0.07 : 0);
          this.nectar = Math.min(this.def.nectarCap, this.nectar + got.nectar);
          this.pollen = Math.min(this.def.pollenCap, this.pollen + got.pollen);
          if ((G.tick + this.id) % 24 === 0 && G.nearPlayer(this.x, this.y) < 200) Sfx.play('sip');
          if ((f.nectar < 0.15 && f.pollen < 0.15)) this.target = null;
        }
        if (++this.homeT > 2400) { this.homeT = 0; this.state = 'store'; }
        break;
      }

      case 'store': {
        this.homeT = 0;
        // nothing left to unload: back to work immediately, wherever we are
        if (this.nectar < 0.4 && this.pollen < 0.4) {
          this.state = 'idle'; this.stateT = 24 + Math.random() * 50; this.target = null; this.storeT = 0; break;
        }
        // first get inside the hive, then unload into the NEAREST cell with room
        if (!inCavity(this.x, this.y)) { this.flyTo(Comb.hive.broodCx, Comb.hive.cavY0 + 40, this.def.accel); this.storeT = 0; break; }
        if (!this.target || this.target.type === 'pupa' || this.target.zone === 'brood' ||
            (this.nectar > 0.5 && this.target.capped)) {
          if (this.nectar > 0.5) this.target = Comb.nectarRoomNear(this.x, this.y, 9999);
          else if (this.pollen > 0.5) this.target = Comb.pollenRoomNear(this.x, this.y, 9999);
          else { this.state = 'idle'; this.stateT = 50 + Math.random() * 110; break; }
          if (!this.target) {  // comb is full: dump and rest
            this.nectar *= 0.5; this.pollen *= 0.5;
            this.state = 'idle'; this.stateT = 120; break;
          }
        }
        const cell = this.target;
        const d = this.flyTo(cell.x, cell.y, this.def.accel);
        if (d < 8) {
          if (this.nectar > 0.4 && (cell.type === 'empty' || cell.type === 'honey' || cell.type === 'nectar') && !cell.capped) {
            const give = Math.min(1 - cell.amount, this.nectar / HONEY_PER_CELL, 0.14);
            if (give > 0.001) {
              if (cell.type === 'empty') { cell.type = 'nectar'; cell.age = 0; }
              cell.amount = Math.min(1, cell.amount + give);
              this.nectar -= give * HONEY_PER_CELL;
            } else this.target = null;
            if (cell.amount >= 1) this.target = null;
          } else if (this.pollen > 0.4 && (cell.type === 'empty' || cell.type === 'pollen')) {
            const give = Math.min(1 - cell.amount, this.pollen / POLLEN_PER_CELL, 0.16);
            if (give > 0.001) {
              if (cell.type === 'empty') cell.type = 'pollen';
              cell.amount = Math.min(1, cell.amount + give);
              this.pollen -= give * POLLEN_PER_CELL;
            } else this.target = null;
            if (cell.amount >= 1) this.target = null;
          } else this.target = null;
          if (this.nectar < 0.4 && this.pollen < 0.4) {
            this.state = 'idle'; this.stateT = 30 + Math.random() * 70;
            if (G.nearPlayer(this.x, this.y) < 200) Sfx.play('deposit');
          }
        }
        // watchdog: never get permanently stuck holding a load
        if (++this.storeT > 700) { this.storeT = 0; this.target = null; this.state = 'idle'; this.stateT = 40; }
        break;
      }

      case 'nurse': {
        if (this.feedLoad > 0) {
          // find a hungry larva and feed it
          const larva = (this.target && this.target.type === 'larva' && this.target.hungry)
            ? this.target : Comb.hungryLarvaNear(this.x, this.y, 9999);
          if (!larva) { this.feedLoad = 0; this.state = 'idle'; this.stateT = 90; break; }
          this.target = larva;
          const d = this.flyTo(larva.x, larva.y, this.def.accel);
          if (d < 8) {
            larva.hungry = false; larva.fed++;
            this.feedLoad = 0; this.target = null;
            if (G.nearPlayer(this.x, this.y) < 200) Sfx.play('sip');
            this.state = 'idle'; this.stateT = 60;
          }
        } else {
          // load jelly: visit a pollen cell (consumes a little hive pollen)
          const pc = (this.target && this.target.type === 'pollen') ? this.target
            : Comb.nearest(Comb.hive.broodCx, Comb.hive.broodCy, 9999, c => c.type === 'pollen' && c.amount > 0.15);
          if (!pc || !G.hive || G.hive.pollenUnits < 1) { this.state = 'forage'; this.target = null; break; }
          this.target = pc;
          const d = this.flyTo(pc.x, pc.y, this.def.accel);
          if (d < 8) {
            pc.amount = Math.max(0, pc.amount - 0.05);
            if (pc.amount <= 0.001) pc.type = 'empty';
            this.feedLoad = 1; this.target = null;
          }
        }
        break;
      }

      case 'build': {
        const spot = (this.target && !this.target.built && this.target.nbrs.some(n => n.built))
          ? this.target : Comb.buildableNear(Comb.hive.broodCx, Comb.hive.broodCy, 9999);
        if (!spot || !G.hive || G.hive.honeyUnits < 30) { this.state = 'idle'; this.stateT = 80; this.target = null; break; }
        this.target = spot;
        const d = this.flyTo(spot.x, spot.y, this.def.accel, true);
        if (d < 8) {
          this.buildT = (this.buildT | 0) + 1;
          if ((G.tick + this.id) % 10 === 0 && G.nearPlayer(this.x, this.y) < 200) Sfx.play('build');
          if (this.buildT > 90) {
            this.buildT = 0;
            Comb.buildCell(spot); G.hive && Comb.drainHoney(3);
            this.state = 'idle'; this.stateT = 50; this.target = null;
          }
        }
        break;
      }

      case 'guard': {
        this.stateT--;
        this.wantInside = false;   // patrol the entrance from outside
        const t = G.nearestThreat(this.x, this.y, 220);
        if (t) { this.state = 'fight'; this.target = t; break; }
        // patrol around the entrance
        const h = Comb.hive;
        const px = h.outer.x + Math.sin((G.tick + this.id * 20) * 0.02) * 26;
        const py = h.outer.y - 8 + Math.cos((G.tick + this.id * 13) * 0.02) * 16;
        this.flyTo(px, py, this.def.accel * 0.7);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 120; }
        break;
      }

      case 'fight': {
        const t = (this.target && !this.target.dead && this.target.hp > 0) ? this.target
          : G.nearestThreat(this.x, this.y, 240);
        if (!t) { this.state = this.caste === 'guard' ? 'guard' : 'idle'; this.stateT = 120; break; }
        this.target = t;
        this.wantInside = t.inside;   // follow the foe across the threshold
        if (this.hp < this.maxHp * 0.3 && this.caste !== 'guard') { this.state = 'flee'; this.stateT = 100; break; }
        const d = this.flyTo(t.x, t.y, this.def.accel);
        if (d < 11 && this.stingCd <= 0) {
          t.hurt(this.def.dmg, Math.sign(t.x - this.x) * 0.8, -0.3);
          this.stingCd = 30;
          if (G.nearPlayer(this.x, this.y) < 220) Sfx.play('sting');
        }
        break;
      }

      case 'flee': {
        this.stateT--;
        const t = G.nearestThreat(this.x, this.y, 180);
        if (t) {
          const ax = Math.sign(this.x - t.x) || 1, ay = Math.sign(this.y - t.y) || -1;
          this.goTo(this.x + ax * 30, this.y + ay * 20, this.def.accel * 1.2);
        } else {
          // duck back into the hive
          this.flyTo(Comb.hive.broodCx, Comb.hive.cavY0 + 40, this.def.accel);
        }
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 90; }
        break;
      }

      case 'queen': {
        this.stateT--;
        const h = Comb.hive;
        // drift slowly across the brood comb
        const qx = h.broodCx + Math.sin(G.tick * 0.004 + this.id) * 50;
        const qy = h.broodCy + Math.cos(G.tick * 0.003) * 26;
        this.flyTo(qx, qy, this.def.accel);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 200; }
        break;
      }

      case 'drone': {
        this.stateT--;
        if (Math.random() < 0.02) this.wanderA = Math.random() * Math.PI * 2;
        const h = Comb.hive;
        this.flyTo(h.broodCx + Math.cos(this.wanderA) * 40, h.cavY0 + 60 + Math.sin(this.wanderA) * 30, this.def.accel * 0.5);
        if (this.stateT <= 0) { this.state = 'idle'; this.stateT = 200; }
        break;
      }
    }
  }

  draw(ctx, camx, camy) {
    const c = this.def;
    const ex = Math.round(this.x - camx), ey = Math.round(this.y - camy);
    if (ex < -16 || ex > 336 || ey < -16 || ey > 216) return;
    const s = c.size;
    ctx.save();
    ctx.translate(ex, ey);
    // bank slightly in the direction of travel
    const bank = clamp(this.vy * 0.08, -0.4, 0.4);
    ctx.rotate(this.dir < 0 ? -bank : bank);
    ctx.scale(this.dir * s, s);

    const fl = this.flash > 0;
    const body = fl ? '#ffffff' : `rgb(${c.color[0]},${c.color[1]},${c.color[2]})`;
    const dark = fl ? '#ffffff' : '#241a0a';

    // wings: fast 2-frame flutter, translucent
    const wup = (this.wing | 0) % 2;
    ctx.fillStyle = 'rgba(225,235,250,0.65)';
    ctx.fillRect(-3, -5 - wup, 4, 2);
    ctx.fillRect(-2, -6 - wup, 3, 1);
    ctx.fillRect(0, -5 - (1 - wup), 3, 2);

    // legs
    ctx.fillStyle = dark;
    const lo = Math.sin(this.phase) > 0 ? 1 : 0;
    ctx.fillRect(-2 + lo, 2, 1, 1);
    ctx.fillRect(1 - lo, 2, 1, 1);
    // pollen baskets on the hind legs
    if (this.pollen > 0.5) {
      ctx.fillStyle = fl ? '#fff' : '#e8951c';
      ctx.fillRect(-3, 2, 2, 2);
    }

    // striped abdomen, plumper when full of nectar
    const plump = this.nectar > c.nectarCap * 0.5 ? 1 : 0;
    ctx.fillStyle = body;
    ctx.fillRect(-6 - (this.caste === 'queen' ? 2 : 0), -2 - plump, 6, 4 + plump * 2);
    ctx.fillStyle = dark;       // stripes
    ctx.fillRect(-5, -2 - plump, 1, 4 + plump * 2);
    ctx.fillRect(-3, -2 - plump, 1, 4 + plump * 2);
    ctx.fillRect(-1, -2 - plump, 1, 4 + plump * 2);
    // thorax (fuzzy)
    ctx.fillStyle = body;
    ctx.fillRect(0, -2, 3, 4);
    ctx.fillStyle = fl ? '#fff' : '#3a2a12';
    ctx.fillRect(0, -2, 3, 1);
    // head
    ctx.fillStyle = dark;
    ctx.fillRect(3, -1, 2, 3);
    // antennae
    ctx.fillRect(5, -3, 1, 1);
    ctx.fillRect(4, -2, 1, 1);
    // eye glint
    ctx.fillStyle = fl ? '#fff' : '#90b0d0';
    ctx.fillRect(4, 0, 1, 1);
    ctx.restore();

    // player marker
    if (this.playerIdx >= 0) {
      ctx.fillStyle = this.playerIdx === 0 ? '#ffe080' : '#80d0ff';
      const bob = (G.tick >> 4) % 2;
      ctx.fillRect(ex - 1, ey - 10 - bob, 3, 1);
      ctx.fillRect(ex, ey - 11 - bob, 1, 2);
    }
  }
}

// ---------------------------------------------------------------------------
// Flower -- nectar & pollen source in the meadow
// ---------------------------------------------------------------------------
const FLOWER_DEF = {
  clover:    { nectar: 9,  pollen: 5,  regen: 0.0023, tall: 0, petal: '#e88aa8', center: '#f4c0d4' },
  daisy:     { nectar: 6,  pollen: 8,  regen: 0.0021, tall: 1, petal: '#f4f4ec', center: '#f0c020' },
  poppy:     { nectar: 7,  pollen: 9,  regen: 0.0020, tall: 1, petal: '#e83828', center: '#201810' },
  lavender:  { nectar: 11, pollen: 4,  regen: 0.0027, tall: 1, petal: '#9a6cd0', center: '#7a4cb0' },
  dandelion: { nectar: 5,  pollen: 10, regen: 0.0030, tall: 0, petal: '#f6c820', center: '#e0a010' },
  bluebell:  { nectar: 10, pollen: 5,  regen: 0.0022, tall: 1, petal: '#5878d8', center: '#3a5ac0' },
};

class Flower {
  constructor(x, y, kind) {
    this.id = ENT_ID++;
    this.kind = kind;
    const d = FLOWER_DEF[kind] || FLOWER_DEF.clover;
    this.x = x; this.y = y;
    this.maxNectar = d.nectar; this.maxPollen = d.pollen;
    this.nectar = d.nectar * (0.4 + Math.random() * 0.6);
    this.pollen = d.pollen * (0.4 + Math.random() * 0.6);
    this.regen = d.regen;
    this.tall = d.tall;
    this.sway = Math.random() * 10;
    this.dead = false;
  }
  get def() { return FLOWER_DEF[this.kind]; }
  update() {
    // blooms refill faster in summer, barely at all in winter
    const bloom = G.hive ? G.hive.season().bloom : 1;
    this.nectar = Math.min(this.maxNectar, this.nectar + this.regen * this.maxNectar * bloom);
    this.pollen = Math.min(this.maxPollen, this.pollen + this.regen * this.maxPollen * bloom);
  }
  // returns how much nectar/pollen was actually drawn
  harvest(nReq, pReq) {
    const n = Math.min(this.nectar, nReq), p = Math.min(this.pollen, pReq);
    this.nectar -= n; this.pollen -= p;
    if (Math.random() < 0.3) G.particles.sparkle(this.x, this.y - (this.tall ? 9 : 4), 1);
    return { nectar: n, pollen: p };
  }
  bloomLevel() { return (this.nectar / this.maxNectar + this.pollen / this.maxPollen) / 2; }

  draw(ctx, camx, camy) {
    const ex = Math.round(this.x - camx), ey = Math.round(this.y - camy);
    if (ex < -8 || ex > 328 || ey < -16 || ey > 208) return;
    const d = this.def;
    const bloom = this.bloomLevel();
    const sway = Math.round(Math.sin(G.tick * 0.03 + this.sway) * (this.tall ? 1 : 0));
    const stemH = this.tall ? 8 : 3;
    // stem
    ctx.fillStyle = '#3c7a32';
    for (let i = 0; i < stemH; i++) {
      ctx.fillRect(ex + Math.round(sway * i / stemH), ey - i, 1, 1);
    }
    const hx = ex + sway, hy = ey - stemH;
    // bloom (faded/closed when depleted)
    if (bloom < 0.18) {
      ctx.fillStyle = '#4a8038';
      ctx.fillRect(hx - 1, hy, 2, 2);
      return;
    }
    ctx.fillStyle = d.petal;
    if (this.kind === 'lavender') {
      for (let i = 0; i < 4; i++) ctx.fillRect(hx, hy - i * 2, 1, 1), ctx.fillRect(hx - 1, hy - i * 2, 1, 1);
      ctx.fillStyle = d.center; ctx.fillRect(hx, hy - 2, 1, 1);
    } else if (this.kind === 'dandelion' || this.kind === 'clover') {
      ctx.fillRect(hx - 2, hy - 1, 5, 3);
      ctx.fillRect(hx - 1, hy - 2, 3, 5);
      ctx.fillStyle = d.center; ctx.fillRect(hx, hy, 1, 1);
    } else {
      // 4-petal bloom
      ctx.fillRect(hx - 2, hy - 1, 5, 3);
      ctx.fillRect(hx - 1, hy - 2, 3, 5);
      ctx.fillStyle = d.center; ctx.fillRect(hx, hy, 1, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Threats -- wasp, hornet, robber bee, spider
// ---------------------------------------------------------------------------
const THREAT_DEF = {
  wasp:   { hp: 26,  speed: 2.3,  dmg: 6,  fly: true,  corpse: 0 },
  hornet: { hp: 70,  speed: 2.0,  dmg: 12, fly: true,  corpse: 0 },
  robber: { hp: 20,  speed: 2.2,  dmg: 4,  fly: true,  corpse: 0 },
  spider: { hp: 40,  speed: 0.0,  dmg: 9,  fly: false, corpse: 0 },
  // VESPA CRABRO -- the giant European hornet. A phased boss: hunts bees,
  // tears the brood apart, and enrages at low health, calling in wasps.
  vespa:  { hp: 300, speed: 2.05, dmg: 16, fly: true,  corpse: 0 },
};

class Threat {
  constructor(x, y, kind) {
    this.id = ENT_ID++;
    this.kind = kind;
    const d = THREAT_DEF[kind];
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.maxSpeed = d.speed;
    this.boss = kind === 'vespa';
    this.hw = this.boss ? 8 : (kind === 'hornet' || kind === 'spider') ? 5 : 3.5;
    this.hh = this.boss ? 5 : (kind === 'hornet' || kind === 'spider') ? 3.5 : 2.5;
    this.summonCd = 480;     // boss enrage: time between calling in wasps
    this.hp = d.hp; this.maxHp = d.hp;
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.phase = Math.random() * 10;
    this.wing = Math.random() * 10;
    this.state = 'come';
    this.target = null;
    this.biteCd = 0;
    this.flash = 0;
    this.fleeing = false;
    this.loot = 0;           // robber's stolen honey
    this.lifeT = this.boss ? 1e9 : 60 * 60;   // a boss never gives up
    this.homeX = x < WORLD_W / 2 ? 12 : WORLD_W - 12;
    this.anchorX = x; this.anchorY = y;  // spider web anchor
    this.inside = inCavity(x, y);
    this.wantInside = false;
    this.layerCd = 0;
  }
  get def() { return THREAT_DEF[this.kind]; }
  get predator() { return this.kind === 'wasp' || this.kind === 'hornet' || this.kind === 'spider' || this.boss; }

  hurt(dmg, kx, ky) {
    this.hp -= dmg;
    this.flash = 6;
    // the boss is too heavy to be knocked far, and never flees -- it enrages
    const k = this.boss ? 0.25 : 1;
    this.vx += (kx || 0) * k; this.vy += (ky || 0) * k;
    G.particles.blood(this.x, this.y, this.boss ? 6 : 4);
    if (!this.boss && this.hp < this.maxHp * 0.3) this.fleeing = true;
    if (G.nearPlayer(this.x, this.y) < 220) Sfx.play('hurt');
  }

  update() {
    if (this.flash > 0) this.flash--;
    if (this.biteCd > 0) this.biteCd--;
    this.wing += 1.1;
    this.phase += 0.1 + Math.hypot(this.vx, this.vy) * 0.05;
    this.lifeT--;
    if (this.lifeT <= 0) this.fleeing = true;

    switch (this.kind) {
      case 'wasp':
      case 'hornet': this.waspThink(); break;
      case 'robber': this.robberThink(); break;
      case 'spider': this.spiderThink(); break;
      case 'vespa':  this.vespaThink(); break;
    }
    if (this.def.fly) { flyStep(this); crossDoor(this); }
  }

  // VESPA CRABRO boss: bites any bee that strays close, drives into the comb to
  // shred the brood, and enrages below a third health -- faster, and summoning
  // wasps to the assault. Never flees; must be brought down.
  vespaThink() {
    const d = this.def;
    const enraged = this.hp < this.maxHp * 0.3;
    const sp = d.speed * (enraged ? 1.3 : 1);

    if (enraged && --this.summonCd <= 0) {
      this.summonCd = 540;
      const sx = this.x < WORLD_W / 2 ? 40 : WORLD_W - 40;
      G.threats.push(new Threat(sx, T.surf[clamp(sx | 0, 0, WORLD_W - 1)] - 60, 'wasp'));
      if (G.nearPlayer(this.x, this.y) < 420) Sfx.play('alarm');
    }

    // savage any bee in reach (the player included)
    const near = G.nearestBee(this.x, this.y, 140);
    if (near && this.biteCd <= 0 && dist2(this.x, this.y, near.x, near.y) < 240) {
      near.hurt(d.dmg, Math.sign(near.x - this.x) * 1.8, -0.4);
      this.biteCd = enraged ? 26 : 40;
      if (G.nearPlayer(this.x, this.y) < 300) Sfx.play('sting');
    }

    // primary objective: tear the brood comb apart; else hunt bees; else loom
    const cell = Comb.nearest(Comb.hive.broodCx, Comb.hive.broodCy, 9999,
      c => c.type === 'larva' || c.type === 'pupa');
    if (cell) {
      this.wantInside = true;
      const dd = this.flyTo(cell.x, cell.y, sp * 0.5);
      if (dd < 12) {
        cell.type = 'empty'; cell.amount = 0; cell.capped = false;
        G.particles.blood(cell.x, cell.y, 5); this.biteCd = Math.max(this.biteCd, 18);
      }
    } else {
      const prey = G.nearestBee(this.x, this.y, 420);
      if (prey) { this.wantInside = prey.inside; this.flyTo(prey.x, prey.y, sp * 0.55); }
      else { this.wantInside = false; this.goTo(Comb.hive.outer.x, Comb.hive.outer.y - 20, sp * 0.4); }
    }
  }

  goTo(tx, ty, accel) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy) || 1;
    this.vx += dx / d * accel; this.vy += dy / d * accel;
    if (Math.abs(dx) > 1.5) this.dir = dx > 0 ? 1 : -1;
    return d;
  }

  flyTo(tx, ty, accel, destInside) {
    if (destInside === undefined) destInside = inCavity(tx, ty);
    if (this.inside !== destInside) {
      const h = Comb.hive;
      const gate = this.inside ? h.inner : h.entrance;
      this.goTo(gate.x, gate.y, accel);
      return Math.hypot(tx - this.x, ty - this.y);
    }
    return this.goTo(tx, ty, accel);
  }

  waspThink() {
    const d = this.def;
    if (this.fleeing) {
      this.wantInside = false;
      this.goTo(this.homeX, this.y - 40, d.speed * 0.5);
      if (Math.abs(this.x - this.homeX) < 30) this.dead = true;
      return;
    }
    // hunt the nearest bee; hornets press into the hive for brood
    let prey = G.nearestBee(this.x, this.y, this.kind === 'hornet' ? 320 : 200);
    if (prey) {
      this.target = prey;
      this.wantInside = prey.inside;
      const dd = this.flyTo(prey.x, prey.y, d.speed * 0.5);
      if (dist2(this.x, this.y, prey.x, prey.y) < 100 && this.biteCd <= 0) {
        prey.hurt(d.dmg, this.dir * 1.0, -0.3);
        this.biteCd = 45;
        if (G.nearPlayer(this.x, this.y) < 240) Sfx.play('sting');
      }
    } else if (this.kind === 'hornet') {
      // raid the brood comb
      const larva = Comb.nearest(Comb.hive.broodCx, Comb.hive.broodCy, 9999, c => c.type === 'larva' || c.type === 'pupa');
      if (larva) {
        this.wantInside = true;
        const dd = this.flyTo(larva.x, larva.y, d.speed * 0.45);
        if (dd < 9) { larva.type = 'empty'; larva.amount = 0; larva.capped = false; G.particles.blood(larva.x, larva.y, 4); this.biteCd = 30; }
      } else { this.wantInside = false; this.patrol(d); }
    } else { this.wantInside = false; this.patrol(d); }
  }

  patrol(d) {
    const h = Comb.hive;
    if (Math.random() < 0.01) this.dir = -this.dir;
    const tx = this.x + this.dir * 50;
    const ty = (T.surf[clamp(this.x | 0, 0, WORLD_W - 1)] - 50) - Math.sin(G.tick * 0.04 + this.phase) * 10;
    this.goTo(tx, ty, d.speed * 0.4);
  }

  robberThink() {
    const d = this.def;
    if (this.fleeing || this.loot > 0.8) {
      this.fleeing = true;
      this.wantInside = false;
      // carry the loot off the map
      this.flyTo(this.homeX, T.surf[clamp(this.x | 0, 0, WORLD_W - 1)] - 60, d.speed * 0.5);
      if (Math.abs(this.x - this.homeX) < 30) this.dead = true;
      return;
    }
    // dive into the hive and drain a honey cell
    this.wantInside = true;
    const cell = (this.target && this.target.type === 'honey') ? this.target
      : Comb.nearest(Comb.hive.broodCx, Comb.hive.cavY0 + 30, 9999, c => c.type === 'honey' && c.amount > 0.1);
    if (!cell) { this.fleeing = true; return; }
    this.target = cell;
    const dd = this.flyTo(cell.x, cell.y, d.speed * 0.5);
    if (dd < 8) {
      const take = Math.min(cell.amount, 0.04);
      cell.amount -= take; this.loot += take;
      if (cell.amount <= 0.001) { cell.type = 'empty'; cell.capped = false; this.target = null; }
    }
  }

  spiderThink() {
    // clings to a web near the hive; lunges at passing bees, then reels back
    const d = this.def;
    const prey = G.nearestBee(this.x, this.y, 70);
    if (prey && !this.fleeing) {
      // (no fly) creep toward prey along the web
      this.x += clamp(prey.x - this.x, -1.4, 1.4);
      this.y += clamp(prey.y - this.y, -1.4, 1.4);
      if (dist2(this.x, this.y, prey.x, prey.y) < 90 && this.biteCd <= 0) {
        prey.hurt(d.dmg, Math.sign(prey.x - this.x), -0.2);
        this.biteCd = 50;
        if (G.nearPlayer(this.x, this.y) < 240) Sfx.play('sting');
      }
    } else {
      // drift back to the web anchor
      this.x += clamp(this.anchorX - this.x, -0.6, 0.6);
      this.y += clamp(this.anchorY - this.y, -0.6, 0.6);
      if (this.fleeing && Math.abs(this.x - this.anchorX) < 2) this.dead = true;
    }
  }

  draw(ctx, camx, camy) {
    const ex = Math.round(this.x - camx), ey = Math.round(this.y - camy);
    if (ex < -24 || ex > 344 || ey < -24 || ey > 224) return;
    const fl = this.flash > 0;
    switch (this.kind) {
      case 'wasp':
      case 'hornet': {
        const big = this.kind === 'hornet';
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(this.dir, 1);
        const wup = (this.wing | 0) % 2;
        ctx.fillStyle = 'rgba(230,238,250,0.7)';
        ctx.fillRect(-3, -5 - wup, 5, 2);
        ctx.fillRect(-1, -6 - wup, 4, 1);
        // abdomen: yellow & black bands
        ctx.fillStyle = fl ? '#fff' : (big ? '#e8902a' : '#f0d028');
        ctx.fillRect(-7 - (big ? 1 : 0), -2, 7 + (big ? 1 : 0), 4);
        ctx.fillStyle = fl ? '#fff' : '#1a1410';
        ctx.fillRect(-6, -2, 1, 4);
        ctx.fillRect(-4, -2, 1, 4);
        ctx.fillRect(-2, -2, 1, 4);
        ctx.fillRect(-8, 0, 1, 1); // sting
        // thorax + head
        ctx.fillStyle = fl ? '#fff' : '#2a2018';
        ctx.fillRect(0, -2, 3, 4);
        ctx.fillRect(3, -1, 2, 3);
        ctx.fillStyle = '#d02020';
        ctx.fillRect(4, 0, 1, 1);
        ctx.restore();
        break;
      }
      case 'vespa': {
        // the giant hornet: long banded gaster, fuzzy brown thorax, big jaws
        const enr = this.hp < this.maxHp * 0.3;
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(this.dir, 1);
        const wup = (this.wing | 0) % 2;
        // big translucent wings
        ctx.fillStyle = 'rgba(236,242,252,0.7)';
        ctx.fillRect(-6, -10 - wup, 11, 3);
        ctx.fillRect(-2, -12 - wup, 8, 2);
        // long abdomen, orange with black bands (redder when enraged)
        ctx.fillStyle = fl ? '#fff' : (enr ? '#ff6e1c' : '#e8922a');
        ctx.fillRect(-14, -4, 12, 8);
        ctx.fillStyle = fl ? '#fff' : '#16100a';
        for (let i = -12; i <= -3; i += 3) ctx.fillRect(i, -4, 1, 8);
        ctx.fillRect(-16, -1, 2, 2);   // stinger
        // fuzzy thorax
        ctx.fillStyle = fl ? '#fff' : '#5c3c1e';
        ctx.fillRect(-2, -4, 6, 8);
        ctx.fillStyle = fl ? '#fff' : '#3a2410';
        ctx.fillRect(-2, -4, 6, 2);
        // head + mandibles
        ctx.fillStyle = fl ? '#fff' : (enr ? '#d89820' : '#c8a02c');
        ctx.fillRect(4, -3, 4, 6);
        ctx.fillStyle = '#241606';
        ctx.fillRect(8, -3, 2, 2); ctx.fillRect(8, 1, 2, 2);   // jaws
        // glaring eyes
        ctx.fillStyle = enr ? '#ff3018' : '#d83018';
        ctx.fillRect(5, -2, 1, 1); ctx.fillRect(6, 1, 1, 1);
        ctx.restore();
        break;
      }
      case 'robber': {
        // a darker, ragged bee
        ctx.save();
        ctx.translate(ex, ey);
        ctx.scale(this.dir, 1);
        const wup = (this.wing | 0) % 2;
        ctx.fillStyle = 'rgba(220,228,240,0.6)';
        ctx.fillRect(-3, -5 - wup, 4, 2);
        ctx.fillStyle = fl ? '#fff' : (this.loot > 0.4 ? '#d8a828' : '#9a8050');
        ctx.fillRect(-6, -2, 6, 4);
        ctx.fillStyle = fl ? '#fff' : '#201810';
        ctx.fillRect(-5, -2, 1, 4);
        ctx.fillRect(-3, -2, 1, 4);
        ctx.fillRect(-1, -2, 1, 4);
        ctx.fillStyle = fl ? '#fff' : '#2a2012';
        ctx.fillRect(0, -2, 3, 4);
        ctx.fillRect(3, -1, 2, 3);
        ctx.fillStyle = '#c02020';
        ctx.fillRect(4, 0, 1, 1);
        ctx.restore();
        break;
      }
      case 'spider': {
        ctx.save();
        ctx.translate(ex, ey);
        // thread up to the anchor
        ctx.fillStyle = 'rgba(220,225,235,0.3)';
        const ay = Math.round(this.anchorY - this.y);
        if (ay < 0) for (let yy = ay; yy < 0; yy += 2) ctx.fillRect(0, yy, 1, 1);
        ctx.scale(this.dir, 1);
        const body = fl ? '#fff' : '#2a2420';
        const dk = fl ? '#fff' : '#181410';
        const lo = Math.sin(this.phase * 1.5) > 0 ? 1 : 0;
        ctx.fillStyle = dk;
        for (let i = 0; i < 4; i++) {
          const lx = -3 + i * 2, o = (i + lo) % 2;
          ctx.fillRect(lx, -3 - o, 1, 2);
          ctx.fillRect(lx - 1, 2 + o, 1, 2);
          ctx.fillRect(lx + 4, -3 - (1 - o), 1, 2);
          ctx.fillRect(lx + 5, 2 + (1 - o), 1, 2);
        }
        ctx.fillStyle = body;
        ctx.fillRect(-5, -2, 6, 5);
        ctx.fillRect(1, -1, 4, 3);
        ctx.fillStyle = '#c83020';
        ctx.fillRect(3, -1, 1, 1);
        ctx.fillRect(4, 0, 1, 1);
        ctx.restore();
        break;
      }
    }
  }
}
