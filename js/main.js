// BIER -- main: game state, input, flight control, rendering, menus.
'use strict';

const VIEW_W = 320, VIEW_H = 200, HUD_H = 24;

// key bindings per player (KeyboardEvent.code)
const BIND = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', sting: 'Space', act: 'KeyE', swap: 'Tab' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', sting: 'Period', act: 'Comma', swap: 'KeyL' },
];

// ---------------------------------------------------------------------------
// global game object
// ---------------------------------------------------------------------------
const G = {
  state: 'title',
  running: false,
  seed: 0,
  slot: 1,
  tick: 0,
  playerCount: 1,
  players: [],
  splitVert: (() => { try { return localStorage.getItem('bier_split') === 'v'; } catch (e) { return false; } })(),
  bees: [], flowers: [], threats: [],
  hg: null,           // hive geometry
  hive: null,         // Hive simulation
  msgs: [],
  deadQueue: [],
  takeover: null,
  menuSel: 0,
  slotSel: 0,
  eraseArm: -1,
  autosaveT: 0,
  introLine: 0,
  showMap: false,
  prevState: 'title',
  endStats: null,
  stars: [], clouds: [], hills: [],

  get day() { return Math.floor(this.tick / DAY_LEN); },
  tod() { return (this.tick % DAY_LEN) / DAY_LEN; },
  isNight() { return this.tod() >= 0.72 || this.tod() < 0.04; },

  msg(text, color) {
    this.msgs.push({ text, color: color || '#f0e2b8', t: 300 });
    if (this.msgs.length > 4) this.msgs.shift();
  },

  nearPlayer(x, y) {
    let best = Infinity;
    for (const p of this.players) {
      if (!p.bee || p.bee.hp <= 0) continue;
      const d = Math.hypot(p.bee.x - x, p.bee.y - y);
      if (d < best) best = d;
    }
    return best;
  },

  nearestThreat(x, y, r) {
    let best = null, bd = r * r, bf = null, bfd = r * r;
    for (const t of this.threats) {
      if (t.dead) continue;
      const d = dist2(x, y, t.x, t.y);
      if (!t.fleeing && d < bd) { bd = d; best = t; }
      if (d < bfd) { bfd = d; bf = t; }
    }
    return best || null;
  },

  nearestBee(x, y, r) {
    let best = null, bd = r * r;
    for (const b of this.bees) {
      if (b.hp <= 0) continue;
      const d = dist2(x, y, b.x, b.y);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  },

  // pick a blooming flower to forage, strongly biased toward nearby ones so
  // trips stay short and honey keeps flowing in
  pickFlower(x) {
    const near = [], any = [];
    let best = null, bd = Infinity;
    for (const f of this.flowers) {
      if (f.bloomLevel() < 0.2) continue;
      any.push(f);
      const d = Math.abs(f.x - x);
      if (d < bd) { bd = d; best = f; }
      if (d < 480) near.push(f);
    }
    if (near.length) return near[(Math.random() * near.length) | 0];
    return best || (any.length ? any[(Math.random() * any.length) | 0] : null);
  },

  winGame() {
    this.endStats = { day: this.day, score: this.hive.score, stats: Object.assign({}, this.hive.stats), won: true };
    this.running = false;
    this.state = 'win';
    deleteWorld(this.slot);
    Sfx.play('task');
  },

  particles: {
    list: [],
    add(x, y, vx, vy, life, color, grav) {
      if (this.list.length > 400) this.list.shift();
      this.list.push({ x, y, vx, vy, life, max: life, color, grav: grav == null ? 0.05 : grav });
    },
    blood(x, y, n) {
      for (let i = 0; i < n; i++) this.add(x, y, (Math.random() - 0.5) * 1.4, -Math.random() * 1.0,
        16 + Math.random() * 12, Math.random() < 0.5 ? '#e8c020' : '#c89020', 0.06);
    },
    sparkle(x, y, n) {
      for (let i = 0; i < n; i++) this.add(x, y, (Math.random() - 0.5) * 0.8, -Math.random() * 0.7 - 0.2,
        20 + Math.random() * 12, Math.random() < 0.5 ? '#ffe85a' : '#fff8b0', 0.01);
    },
    update() {
      for (const p of this.list) {
        p.vy += p.grav; p.x += p.vx; p.y += p.vy;
        if (T.solid(p.x, p.y)) { p.vx = 0; p.vy = 0; }
        p.life--;
      }
      this.list = this.list.filter(p => p.life > 0);
    },
    draw(ctx, camx, camy) {
      for (const p of this.list) {
        const ex = Math.round(p.x - camx), ey = Math.round(p.y - camy);
        if (ex < 0 || ex > VIEW_W || ey < 0 || ey > VIEW_H) continue;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.min(1, p.life / (p.max * 0.5));
        ctx.fillRect(ex, ey, 1, 1);
        ctx.globalAlpha = 1;
      }
    }
  },
};

// ---------------------------------------------------------------------------
// input
// ---------------------------------------------------------------------------
const keys = {};
const pressed = {};

window.addEventListener('keydown', e => {
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  Sfx.init(); Sfx.resume();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; Sfx.setBuzz(0); });

function tookPress(code) {
  if (pressed[code]) { pressed[code] = false; return true; }
  return false;
}

// ---------------------------------------------------------------------------
// world setup
// ---------------------------------------------------------------------------
function buildBackdrop(seed) {
  G.stars = [];
  const srng = mulberry32(seed ^ 0x5e7e);
  for (let i = 0; i < 160; i++) G.stars.push({ x: srng() * WORLD_W, y: srng() * 360 });
  G.clouds = [];
  for (let i = 0; i < 16; i++) G.clouds.push({ x: srng() * WORLD_W, y: 60 + srng() * 220, w: 20 + srng() * 40, sp: 0.05 + srng() * 0.1 });
  G.hills = [];
  for (let i = 0; i < 5; i++) G.hills.push({ x: srng() * WORLD_W, h: 60 + srng() * 80 });
}

function spawnHive() {
  const geo = G.hg, h = geo;
  // a small starting colony
  G.bees.push(new Bee(geo.broodCx, geo.broodCy, 'queen'));
  for (let i = 0; i < 7; i++) G.bees.push(new Bee(geo.broodCx + (Math.random() - 0.5) * 70, geo.broodCy - 30 + (Math.random() - 0.5) * 90, 'worker'));
  G.bees.push(new Bee(h.outer.x, h.outer.y - 6, 'guard'));
  G.bees.push(new Bee(geo.broodCx + (Math.random() - 0.5) * 40, geo.broodCy - 20, 'drone'));
}

function newWorld(slot, playerCount) {
  const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
  const world = genWorld(seed);
  T.init(world);
  Comb.init(world.hive, mulberry32(seed ^ 0x10ce));
  G.seed = seed;
  G.slot = slot;
  G.tick = Math.floor(DAY_LEN * 0.12);
  G.playerCount = playerCount;
  G.hg = world.hive;
  G.bees = []; G.flowers = []; G.threats = [];
  G.msgs = []; G.deadQueue = []; G.takeover = null;
  G.particles.list = [];
  ENT_ID = 1;

  spawnHive();
  G.hive = new Hive(world.hive);

  for (const f of world.flowers) G.flowers.push(new Flower(f.x, f.y, f.kind));

  // player bees start in the comb, a little in from the door (not on the gate,
  // which would trigger a transition on frame one)
  G.players = [];
  const di = world.hive.dropIn;
  for (let p = 0; p < playerCount; p++) {
    const b = new Bee(di.x, di.y - 4 + p * 8, 'worker');
    b.playerIdx = p; b.layerCd = 24;
    G.bees.push(b);
    G.players.push({ bee: b, cam: { x: b.x - VIEW_W / 2, y: b.y - 60 } });
  }

  buildBackdrop(seed);
  G.running = true;
  G.autosaveT = 7200;
}

function loadWorld(slot, playerCount) {
  const d = loadWorldData(slot);
  if (!d) return false;
  const world = genWorld(d.seed);
  T.init(world);
  Comb.init(world.hive, null);
  Comb.load(d.cells);
  G.seed = d.seed;
  G.slot = slot;
  G.tick = d.tick;
  G.playerCount = playerCount || d.playerCount;
  G.hg = world.hive;
  G.bees = []; G.flowers = []; G.threats = [];
  G.msgs = []; G.deadQueue = []; G.takeover = null;
  G.particles.list = [];

  const byId = {};
  for (const s of d.bees) {
    const b = new Bee(s.x, s.y, s.caste);
    b.id = s.id; b.hp = s.hp; b.playerIdx = -1;
    b.nectar = s.nectar || 0; b.pollen = s.pollen || 0;
    G.bees.push(b); byId[b.id] = b;
  }
  for (const s of d.flowers) {
    const f = new Flower(s.x, s.y, s.kind);
    f.id = s.id; f.nectar = s.nectar; f.pollen = s.pollen;
    G.flowers.push(f);
  }
  for (const s of d.threats) {
    const t = new Threat(s.x, s.y, s.kind);
    t.id = s.id; t.hp = s.hp; t.fleeing = s.fleeing; t.loot = s.loot || 0;
    if (s.anchorX != null) { t.anchorX = s.anchorX; t.anchorY = s.anchorY; }
    G.threats.push(t);
  }
  ENT_ID = d.nextId || 10000;

  G.hive = new Hive(world.hive);
  Object.assign(G.hive, d.hive);
  G.hive.tasks = d.hive.tasks || [];
  G.hive.stats = d.hive.stats;
  G.hive.refreshTotals();

  // reattach players
  G.players = [];
  const saved = d.bees.filter(s => s.playerIdx >= 0).sort((a, b) => a.playerIdx - b.playerIdx);
  for (let p = 0; p < G.playerCount; p++) {
    let bee = null;
    const sp = saved.find(s => s.playerIdx === p);
    if (sp && byId[sp.id] && byId[sp.id].hp > 0) bee = byId[sp.id];
    if (!bee) bee = G.bees.find(b => b.playerIdx < 0 && b.caste !== 'queen' && b.hp > 0);
    if (bee) {
      bee.playerIdx = p; bee.state = 'idle';
      G.players.push({ bee, cam: { x: bee.x - VIEW_W / 2, y: bee.y - 60 } });
    } else {
      G.players.push({ bee: null, cam: { x: 0, y: 0 } });
      G.deadQueue.push(p);
    }
  }

  buildBackdrop(d.seed);
  G.running = true;
  G.autosaveT = 7200;
  return true;
}

// ---------------------------------------------------------------------------
// player control
// ---------------------------------------------------------------------------
function controlPlayer(pIdx) {
  const p = G.players[pIdx];
  const b = p.bee;
  if (!b || b.hp <= 0) return;
  if (p.trans) { if (pIdx === 0) Sfx.setBuzz(0); return; }   // frozen mid-knothole
  const k = BIND[pIdx];
  const c = b.def;
  const cap = CAP[b.caste];

  // hand control to another bee in the colony (cancellable live switch)
  if (tookPress(k.swap)) { startSwitch(pIdx); return; }

  let dx = (keys[k.right] ? 1 : 0) - (keys[k.left] ? 1 : 0);
  let dy = (keys[k.down] ? 1 : 0) - (keys[k.up] ? 1 : 0);
  if (dx || dy) {
    const len = Math.hypot(dx, dy);
    b.vx += dx / len * c.accel * 1.4;
    b.vy += dy / len * c.accel * 1.4;
    if (dx) b.dir = dx > 0 ? 1 : -1;
  }
  // wingbeat audio tracks thrust + speed (player 1 only)
  if (pIdx === 0) Sfx.setBuzz(0.35 + Math.min(0.65, Math.hypot(b.vx, b.vy) / c.speed * 0.65));

  // sting -- guards lunge with a forward dash; range/cooldown vary by caste
  if (tookPress(k.sting) && cap.dash) { b.vx += b.dir * 2.4; b.vy -= 0.5; }
  if (tookPress(k.sting) || (keys[k.sting] && b.stingCd <= 0)) {
    if (b.stingCd <= 0) {
      const reach = cap.reach, kb = cap.knock;
      let hit = null, bd = reach * reach;
      for (const t of G.threats) {
        if (t.dead || t.inside !== b.inside) continue;
        const d = dist2(b.x, b.y, t.x, t.y);
        if (d < bd) { bd = d; hit = t; }
      }
      if (hit) {
        hit.hurt(c.dmg, Math.sign(hit.x - b.x) * kb, -0.4);
        hit.killedByPlayer = true;
        b.stingCd = cap.stingCd;
        b.vx += Math.sign(b.x - hit.x) * 0.5;
        Sfx.play('sting');
        G.particles.sparkle(hit.x, hit.y, 2);
      } else { b.stingCd = Math.max(10, cap.stingCd - 8); }
    }
  }

  // interact (held): outside the tree you gather at flowers; inside you work
  // the comb -- feed grubs, store nectar/pollen, and build new cells
  if (keys[k.act]) {
    const Hv = G.hive;
    if (!b.inside) {
      // gather at the nearest blooming flower
      if (cap.canForage) {
        let flower = null, fd = 13 * 13;
        for (const f of G.flowers) {
          if (f.bloomLevel() < 0.05) continue;
          const d = dist2(b.x, b.y, f.x, f.y - 4);
          if (d < fd) { fd = d; flower = f; }
        }
        if (flower && (b.nectar < c.nectarCap - 0.3 || (c.pollenCap > 0 && b.pollen < c.pollenCap - 0.3))) {
          const got = flower.harvest(0.22, 0.13);
          b.nectar = Math.min(c.nectarCap, b.nectar + got.nectar);
          b.pollen = Math.min(c.pollenCap, b.pollen + got.pollen);
          if ((G.tick & 7) === 0) Sfx.play('sip');
        }
      }
    } else {
      const cell = Comb.cellAt(b.x, b.y, 9);
      if (cell && cell.built) {
        if (cap.canFeed && cell.type === 'larva' && cell.hungry && (b.pollen > 0.5 || b.nectar > 0.5)) {
          if ((b.feedCd | 0) <= 0 && Hv.feedLarva(cell)) {
            b.pollen = Math.max(0, b.pollen - 1);
            b.nectar = Math.max(0, b.nectar - 0.5);
            b.feedCd = 20;
            Hv.progress('feed', 1);
            G.msg(L('m_fed')); Sfx.play('sip');
            G.particles.sparkle(cell.x, cell.y, 2);
          }
        } else if (cap.canLay && cell.type === 'empty' && cell.zone === 'brood' && Hv.honeyUnits >= 6) {
          // a player queen lays an egg
          if ((b.feedCd | 0) <= 0) {
            cell.type = 'egg'; cell.age = 0; Comb.drainHoney(1.5); b.feedCd = 40;
            G.msg(L('m_laid')); Sfx.play('lay'); G.particles.sparkle(cell.x, cell.y, 2);
          }
        } else if (b.nectar > 0.3 && (cell.type === 'empty' || cell.type === 'honey' || cell.type === 'nectar') && !cell.capped && cell.zone !== 'brood') {
          const give = Math.min(1 - cell.amount, b.nectar / HONEY_PER_CELL, 0.06);
          if (give > 0.001) {
            if (cell.type === 'empty') { cell.type = 'nectar'; cell.age = 0; }
            cell.amount = Math.min(1, cell.amount + give);
            b.nectar -= give * HONEY_PER_CELL;
            if ((G.tick & 7) === 0) Sfx.play('build');
            if (cell.amount >= 1) { Hv.progress('gather', 1); G.particles.sparkle(cell.x, cell.y, 2); Sfx.play('deposit'); }
          }
        } else if (b.pollen > 0.3 && (cell.type === 'empty' || cell.type === 'pollen') && cell.zone !== 'brood') {
          const give = Math.min(1 - cell.amount, b.pollen / POLLEN_PER_CELL, 0.07);
          if (give > 0.001) {
            if (cell.type === 'empty') cell.type = 'pollen';
            cell.amount = Math.min(1, cell.amount + give);
            b.pollen -= give * POLLEN_PER_CELL;
            if ((G.tick & 7) === 0) Sfx.play('build');
          }
        }
      } else if (cap.canBuild) {
        // build new comb: find an unbuilt cell next to existing comb
        const spot = Comb.buildableNear(b.x, b.y, 11);
        if (spot && Hv.honeyUnits >= 4) {
          b.buildT = (b.buildT | 0) + 1;
          if ((G.tick & 7) === 0) Sfx.play('build');
          if (b.buildT >= 45) {
            b.buildT = 0;
            Comb.buildCell(spot); Comb.drainHoney(3);
            Hv.progress('build', 1);
            G.msg(L('m_built')); Sfx.play('deposit');
            G.particles.sparkle(spot.x, spot.y, 3);
          }
        }
      }
    }
  } else if (b.buildT) b.buildT = 0;
  if (b.feedCd > 0) b.feedCd--;
}

// ---------------------------------------------------------------------------
// play update
// ---------------------------------------------------------------------------
function updatePlay() {
  const prevDay = G.day;
  G.tick++;

  for (let p = 0; p < G.players.length; p++) controlPlayer(p);
  if (!G.players.some(p => p.bee && p.bee.hp > 0 && p.bee.playerIdx === 0)) Sfx.setBuzz(0);

  for (const b of G.bees) if (b.hp > 0) b.update();
  for (const p of G.players) updateHiveTransition(p);

  // bee deaths
  for (const b of G.bees) {
    if (b.hp <= 0 && !b.dead) {
      b.dead = true;
      G.particles.blood(b.x, b.y, 5);
      G.hive.stats.beesLost++;
      if (b.playerIdx >= 0) {
        Sfx.play('die');
        G.msg(G.playerCount > 1 ? L('m_pFell', b.playerIdx + 1) : L('m_youFell'), '#ff5040');
        G.deadQueue.push(b.playerIdx);
        G.players[b.playerIdx].bee = null;
      } else if (b.caste === 'queen') {
        G.msg(L('m_queenFell'), '#ff4030'); Sfx.play('alarm');
      } else if (G.nearPlayer(b.x, b.y) < 280) {
        Sfx.play('kill');
      }
    }
  }
  G.bees = G.bees.filter(b => !b.dead);

  // threats
  for (const t of G.threats) {
    t.update();
    if (t.hp <= 0 && !t.dead) {
      t.dead = true;
      G.particles.blood(t.x, t.y, t.boss ? 28 : 8);
      G.hive.stats.threatsSlain++;
      if (t.boss) {
        G.hive.score += 200;
        G.msg(L('m_vespaDown'), '#ffe040');
        Sfx.play('kill'); Sfx.play('task');
      } else {
        G.hive.score += 20;
        G.msg(L('m_threatDown', threatNameDef(t.kind)), '#ffe040');
        Sfx.play('kill');
      }
    }
  }
  G.threats = G.threats.filter(t => !t.dead);

  for (const f of G.flowers) f.update();
  G.particles.update();
  G.hive.update();

  for (const m of G.msgs) m.t--;
  G.msgs = G.msgs.filter(m => m.t > 0);

  // day rollover
  if (G.day !== prevDay) {
    const s = G.hive.season();
    G.msg(L('m_dayN', G.day + 1, seasonName(s.name)), '#ffd060');
  }

  updateCameras();

  // takeover queue
  if (G.deadQueue.length > 0 && !G.takeover) {
    const pIdx = G.deadQueue[0];
    const candidates = controllableBees()
      .sort((x, y) => (x.caste === 'queen' ? 1 : 0) - (y.caste === 'queen' ? 1 : 0))
      .slice(0, 6);
    if (candidates.length === 0) { endWorld(); return; }
    G.takeover = { pIdx, list: candidates, sel: 0 };
    G.menuSel = 0;
    G.state = 'dead';
  }

  if (G.bees.filter(b => b.hp > 0).length === 0) { endWorld(); return; }

  G.autosaveT--;
  if (G.autosaveT <= 0) {
    G.autosaveT = 7200;
    if (saveWorld(G.slot)) { G.msg(L('m_saved'), '#80c0ff'); Sfx.play('save'); }
  }

  if (tookPress('KeyM')) G.showMap = !G.showMap;
  if (tookPress('Escape') || tookPress('KeyP')) { G.state = 'pause'; G.menuSel = 0; Sfx.play('menu'); Sfx.setBuzz(0); }
}

// the on-screen rectangle a given player's view occupies. 1P fills the play
// area; 2P splits it horizontally (stacked) or vertically (side by side).
function playerView(i) {
  const fullH = VIEW_H - HUD_H;
  if (G.playerCount === 1) return { vx: 0, vy: 0, vw: VIEW_W, vh: fullH };
  if (G.splitVert) {
    const vw = (VIEW_W - 2) / 2;
    return { vx: i === 0 ? 0 : vw + 2, vy: 0, vw, vh: fullH };
  }
  const vh = (fullH - 2) / 2;
  return { vx: 0, vy: i === 0 ? 0 : vh + 2, vw: VIEW_W, vh };
}

function updateCameras() {
  for (let i = 0; i < G.players.length; i++) {
    const p = G.players[i];
    if (!p.bee) continue;
    const v = playerView(i);
    if (p.fx === undefined || Math.abs(p.bee.x - p.fx) > 140 || Math.abs(p.bee.y - p.fy) > 140) {
      p.fx = p.bee.x; p.fy = p.bee.y; p.look = p.bee.dir * 26;
    }
    const DZX = 6, DZY = 8;
    if (p.bee.x > p.fx + DZX) p.fx = p.bee.x - DZX;
    else if (p.bee.x < p.fx - DZX) p.fx = p.bee.x + DZX;
    if (p.bee.y > p.fy + DZY) p.fy = p.bee.y - DZY;
    else if (p.bee.y < p.fy - DZY) p.fy = p.bee.y + DZY;
    p.look += (p.bee.dir * 26 - p.look) * 0.03;
    const tx = p.fx - v.vw / 2 + p.look;
    const ty = p.fy - v.vh / 2 - 6;
    p.cam.x += (tx - p.cam.x) * 0.1;
    p.cam.y += (ty - p.cam.y) * 0.1;
    p.cam.x = Math.max(0, Math.min(WORLD_W - v.vw, p.cam.x));
    p.cam.y = Math.max(0, Math.min(WORLD_H - v.vh, p.cam.y));
  }
}

// Player hive entry/exit, animated as an iris wipe through the knothole.
// While p.trans is set the bee is frozen and an iris overlay (drawIris) plays:
// it irises closed on the hole the bee dives into, the layer swaps at the
// pinch point, then irises open around where the bee lands on the far side.
const DOOR_R2 = 121;          // (11px)^2 trigger radius, matching crossDoor
const TRANS_DUR = 10;         // frames per half (close / open)

function updateHiveTransition(p) {
  const b = p.bee;
  if (!b) { p.trans = null; return; }
  const h = Comb.hive;
  const tr = p.trans;

  if (tr) {
    tr.t++;
    if (tr.phase === 'close') {
      // draw the bee into the knothole as the iris closes
      b.x += (tr.cx - b.x) * 0.34; b.y += (tr.cy - b.y) * 0.34;
      b.vx *= 0.6; b.vy *= 0.6;
      if (tr.t >= TRANS_DUR) {
        b.inside = tr.toInside;
        const drop = tr.toInside ? h.dropIn : h.dropOut;
        b.x = drop.x; b.y = drop.y; b.vx *= 0.3; b.vy *= 0.3;
        tr.phase = 'open'; tr.t = 0; tr.cx = drop.x; tr.cy = drop.y;
      }
    } else if (tr.t >= TRANS_DUR) {
      p.trans = null; b.layerCd = 18;
    }
    return;
  }

  if (b.layerCd > 0) { b.layerCd--; return; }
  if (!b.inside && dist2(b.x, b.y, h.entrance.x, h.entrance.y) < DOOR_R2) {
    p.trans = { phase: 'close', t: 0, toInside: true, cx: h.entrance.x, cy: h.entrance.y };
    Sfx.play('menu');
  } else if (b.inside && dist2(b.x, b.y, h.inner.x, h.inner.y) < DOOR_R2) {
    p.trans = { phase: 'close', t: 0, toInside: false, cx: h.inner.x, cy: h.inner.y };
    Sfx.play('menu');
  }
}

function endWorld() {
  G.endStats = { day: G.day, score: G.hive.score, stats: Object.assign({}, G.hive.stats), won: false };
  deleteWorld(G.slot);
  G.running = false;
  G.state = 'gameover';
  Sfx.setBuzz(0);
  Sfx.play('die');
}

// bees the player may take over / switch to (any living NPC bee)
function controllableBees() {
  return G.bees.filter(b => b.hp > 0 && b.playerIdx < 0);
}

// open the bee-select overlay as a cancellable live switch for player pIdx
function startSwitch(pIdx) {
  const cur = G.players[pIdx].bee;
  if (!cur) return;
  const list = controllableBees()
    .sort((a, b) => dist2(a.x, a.y, cur.x, cur.y) - dist2(b.x, b.y, cur.x, cur.y))
    .slice(0, 6);
  if (list.length === 0) { G.msg(L('m_noSwitch'), '#ff8040'); Sfx.play('menu'); return; }
  G.takeover = { pIdx, list, sel: 0, prevBee: cur };
  G.menuSel = 0;
  G.state = 'dead';
  Sfx.play('menu');
}

// ---------------------------------------------------------------------------
// rendering
// ---------------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

function skyColor(tod) {
  const stops = [
    [0.00, [24, 22, 50]],
    [0.05, [120, 110, 150]],
    [0.12, [120, 185, 235]],
    [0.45, [135, 200, 245]],
    [0.66, [240, 175, 120]],
    [0.74, [120, 80, 110]],
    [0.82, [30, 28, 64]],
    [0.96, [24, 22, 50]],
    [1.00, [24, 22, 50]],
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    if (tod >= stops[i][0] && tod <= stops[i + 1][0]) {
      const t = (tod - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
      const a = stops[i][1], b = stops[i + 1][1];
      return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
    }
  }
  return stops[2][1];
}

function drawViewport(p, vx, vy, vw, vh) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(vx, vy, vw, vh);
  ctx.clip();
  ctx.translate(vx, vy);

  const camx = Math.round(p.cam.x), camy = Math.round(p.cam.y);
  const tod = G.tod();
  const viewInside = p.bee ? p.bee.inside : false;

  if (viewInside) drawInside(p, camx, camy, vw, vh, tod);
  else drawOutside(p, camx, camy, vw, vh, tod);

  if (p.trans) drawIris(p, camx, camy, vw, vh);

  ctx.restore();
}

// the knothole iris: black everywhere but a shrinking/growing circle on the
// door, punched out of the fill with a reverse-wound arc
function drawIris(p, camx, camy, vw, vh) {
  const tr = p.trans;
  const maxR = Math.hypot(vw, vh) * 0.62;
  const f = Math.max(0, Math.min(1, tr.t / TRANS_DUR));
  const R = tr.phase === 'close' ? maxR * (1 - f) : maxR * f;
  const sx = Math.round(tr.cx - camx), sy = Math.round(tr.cy - camy);
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.rect(0, 0, vw, vh);
  if (R > 0.5) ctx.arc(sx, sy, R, 0, Math.PI * 2, true);
  ctx.fill();
}

let _knotholeGrad = null;

// the hive interior: a cutaway of the comb behind a dark wall of wood
function drawInside(p, camx, camy, vw, vh, tod) {
  ctx.fillStyle = '#0d0803';
  ctx.fillRect(0, 0, vw, vh);
  // trunk walls (the cutaway terrain leaves the cavity transparent)
  ctx.drawImage(T.terCan, camx, camy, vw, vh, 0, 0, vw, vh);
  // the comb
  Comb.draw(ctx, camx, camy, vw, vh);
  // daylight spilling in through the knothole (gradient cached, just translated)
  const e = Comb.hive.inner, ex = Math.round(e.x - camx), ey = Math.round(e.y - camy);
  if (!G.isNight()) {
    if (!_knotholeGrad) {
      _knotholeGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 30);
      _knotholeGrad.addColorStop(0, 'rgba(255,238,180,0.5)'); _knotholeGrad.addColorStop(1, 'rgba(255,238,180,0)');
    }
    ctx.save();
    ctx.translate(ex, ey);
    ctx.fillStyle = _knotholeGrad;
    ctx.fillRect(-30, -30, 60, 60);
    ctx.restore();
  }
  // entities on the inside layer
  for (const t of G.threats) if (t.inside && !t.dead) t.draw(ctx, camx, camy);
  for (const b of G.bees) if (b.playerIdx < 0 && b.inside) b.draw(ctx, camx, camy);
  for (const pp of G.players) if (pp.bee && pp.bee.inside) pp.bee.draw(ctx, camx, camy);
  G.particles.draw(ctx, camx, camy);
  drawGloom(p, camx, camy, vw, vh, tod, true);
}

// the open meadow, with the tree as a solid trunk you fly in front of
function drawOutside(p, camx, camy, vw, vh, tod) {
  const sc = skyColor(tod);
  ctx.fillStyle = `rgb(${sc[0]},${sc[1]},${sc[2]})`;
  ctx.fillRect(0, 0, vw, vh);

  if (G.isNight()) {
    ctx.fillStyle = '#f0f0ff';
    for (const s of G.stars) {
      const sx = Math.round(s.x - camx * 0.85), sy = Math.round(s.y - camy * 0.85);
      if (sx >= 0 && sx < vw && sy >= 0 && sy < vh && (pxHash(s.x | 0, G.tick >> 5) % 11) !== 0) ctx.fillRect(sx, sy, 1, 1);
    }
  }

  const isDay = tod >= 0.08 && tod < 0.72;
  const ct = isDay ? (tod - 0.08) / 0.64 : ((tod < 0.08 ? tod + 1 : tod) - 0.72) / 0.36;
  const bx = Math.round((ct * (WORLD_W + 200) - 100) - camx * 0.8);
  const by = Math.round((150 - Math.sin(ct * Math.PI) * 130) - camy * 0.8);
  if (bx > -12 && bx < vw + 12 && by > -12 && by < vh + 12) {
    if (isDay) { ctx.fillStyle = '#ffe860'; ctx.fillRect(bx - 3, by - 2, 6, 5); ctx.fillRect(bx - 2, by - 3, 4, 7); }
    else { ctx.fillStyle = '#d8d8e8'; ctx.fillRect(bx - 3, by - 2, 6, 5); ctx.fillRect(bx - 2, by - 3, 4, 7); ctx.fillStyle = '#a8a8c0'; ctx.fillRect(bx, by - 1, 2, 2); }
  }

  if (!G.isNight()) {
    ctx.fillStyle = 'rgba(78,138,84,0.55)';
    const baseY = Math.round(780 - camy * 0.5);
    if (baseY > -40 && baseY < vh + 40) {
      for (const hl of G.hills) {
        const hx = Math.round(hl.x - camx * 0.5);
        if (hx + hl.h < 0 || hx - hl.h > vw) continue;
        for (let i = -hl.h; i <= hl.h; i++) { const ht = hl.h - Math.abs(i); ctx.fillRect(hx + i, baseY - ht, 1, ht + 40); }
      }
    }
  }

  ctx.fillStyle = G.isNight() ? 'rgba(120,120,150,0.25)' : 'rgba(255,255,255,0.7)';
  for (const cl of G.clouds) {
    const ex = Math.round(((cl.x + G.tick * cl.sp) % WORLD_W) - camx * 0.6), ey = Math.round(cl.y - camy * 0.6);
    if (ex < -cl.w || ex > vw + cl.w) continue;
    ctx.fillRect(ex, ey, cl.w, 3);
    ctx.fillRect(ex + 4, ey - 2, cl.w - 8, 3);
  }

  // the world as seen from outside: ground + a SOLID trunk (comb hidden)
  ctx.drawImage(T.extCan, camx, camy, vw, vh, 0, 0, vw, vh);

  // entities on the outside layer
  for (const f of G.flowers) f.draw(ctx, camx, camy);
  for (const t of G.threats) if (!t.inside && !t.dead) t.draw(ctx, camx, camy);
  for (const b of G.bees) if (b.playerIdx < 0 && !b.inside) b.draw(ctx, camx, camy);
  for (const pp of G.players) if (pp.bee && !pp.bee.inside) pp.bee.draw(ctx, camx, camy);
  G.particles.draw(ctx, camx, camy);
  drawGloom(p, camx, camy, vw, vh, tod, false);
}

// the darkness vignette around the player. The gradient shape depends only on
// (tint, amb), so cache one centred at the origin and translate it onto the
// player each frame instead of re-allocating a radial gradient per frame.
const _gloomCache = {};
function gloomGrad(tint, amb) {
  const key = tint + '|' + amb.toFixed(2);
  let g = _gloomCache[key];
  if (!g) {
    g = ctx.createRadialGradient(0, 0, 16, 0, 0, 95);
    g.addColorStop(0, `rgba(${tint},0)`);
    g.addColorStop(0.7, `rgba(${tint},${amb * 0.5})`);
    g.addColorStop(1, `rgba(${tint},${amb})`);
    _gloomCache[key] = g;
  }
  return g;
}

function drawGloom(p, camx, camy, vw, vh, tod, inHive) {
  if (!p.bee) return;
  let amb = 0;
  if (G.isNight()) amb = 0.62;
  else if (tod > 0.64) amb = (tod - 0.64) / 0.08 * 0.4;
  if (inHive) amb = Math.max(amb, 0.66);
  if (amb <= 0.03) return;
  const px = Math.round(p.bee.x - camx), py = Math.round(p.bee.y - camy);
  const tint = inHive ? '12,7,2' : '4,5,14';
  // quantise amb so the cache stays tiny (dusk fades smoothly enough at 0.02 steps)
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = gloomGrad(tint, Math.round(amb * 50) / 50);
  ctx.fillRect(-px, -py, vw, vh);
  ctx.restore();
}

function bevelPanel(x, y, w, h) {
  ctx.fillStyle = '#5a3e1c';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#8a6634';
  ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y, 1, h);
  ctx.fillStyle = '#2e1e0c';
  ctx.fillRect(x, y + h - 1, w, 1); ctx.fillRect(x + w - 1, y, 1, h);
}

function drawHpBar(x, y, w, pct) {
  ctx.fillStyle = '#1a1008'; ctx.fillRect(x, y, w, 5);
  const fw = Math.max(0, Math.round((w - 2) * pct));
  ctx.fillStyle = pct > 0.5 ? '#40c040' : pct > 0.25 ? '#e0c020' : '#e03020';
  ctx.fillRect(x + 1, y + 1, fw, 3);
}

function drawLoadBar(x, y, w, pct, color) {
  ctx.fillStyle = '#1a1008'; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x + 1, y + 1, Math.max(0, Math.round((w - 2) * pct)), 1);
}

function drawHud() {
  const y = VIEW_H - HUD_H;
  bevelPanel(0, y, VIEW_W, HUD_H);
  const Hv = G.hive;

  for (let i = 0; i < G.playerCount; i++) {
    const px = i === 0 ? 4 : VIEW_W - 86;
    const p = G.players[i];
    drawText(ctx, 'P' + (i + 1), px, y + 4, i === 0 ? '#ffe080' : '#80d0ff');
    if (p.bee) {
      drawHpBar(px + 14, y + 4, 40, Math.max(0, p.bee.hp / p.bee.maxHp));
      drawLoadBar(px + 14, y + 11, 40, p.bee.nectar / p.bee.def.nectarCap, '#e8b830');
      drawLoadBar(px + 14, y + 14, 40, p.bee.def.pollenCap ? p.bee.pollen / p.bee.def.pollenCap : 0, '#e07828');
      drawText(ctx, casteName(p.bee.caste), px + 14, y + 17, '#b0a080');
    } else { drawText(ctx, L('w_down'), px + 14, y + 5, '#e03020'); }
  }

  const cx = VIEW_W / 2;
  const bees = G.bees.filter(b => b.hp > 0).length;
  drawText(ctx, '\x02' + bees, cx - 58, y + 4, '#e8c060');
  drawText(ctx, '\x01' + Math.floor(Hv.honeyUnits), cx - 26, y + 4, '#e8b830');
  drawText(ctx, '\x03' + Math.floor(Hv.pollenUnits), cx + 14, y + 4, '#e08828');
  drawText(ctx, (G.isNight() ? '\x05' : '\x04') + seasonName(Hv.season().name) + ' D' + (G.day + 1), cx - 58, y + 14, '#c0c0d8');
  drawText(ctx, L('ui_score', Hv.score), cx + 6, y + 14, '#a0c8a0');
}

function drawTaskAndMsgs() {
  const t = G.hive.tasks.find(t => !t.done) || G.hive.tasks.find(t => t.done && t.doneT > 0);
  if (t) {
    let str = t.done ? taskText(t) + ' - ' + L('w_done') : taskText(t) + ' ' + Math.floor(t.n) + '/' + t.need;
    const blink = t.done && (G.tick >> 3) % 2;
    if (!blink) drawTextS(ctx, str, 4, 3, t.done ? '#ffe040' : '#a8e8a0');
  }
  let my = 14;
  for (const m of G.msgs) {
    ctx.globalAlpha = Math.min(1, m.t / 60);
    drawTextCS(ctx, m.text, VIEW_W / 2, my, m.color);
    ctx.globalAlpha = 1;
    my += 10;
  }
}

function drawMinimap() {
  const mw = 256, mh = 128;
  const mx = (VIEW_W - mw) / 2, my = (VIEW_H - mh) / 2 - 6;
  bevelPanel(mx - 3, my - 3, mw + 6, mh + 6);
  ctx.fillStyle = '#101418'; ctx.fillRect(mx, my, mw, mh);
  ctx.drawImage(T.terCan, 0, 0, WORLD_W, WORLD_H, mx, my, mw, mh);
  const sx = mw / WORLD_W, sy = mh / WORLD_H;
  // flowers
  ctx.fillStyle = '#e070a0';
  for (const f of G.flowers) if (f.bloomLevel() > 0.2) ctx.fillRect(mx + f.x * sx, my + f.y * sy, 1, 1);
  // bees
  for (const b of G.bees) {
    if (b.hp <= 0) continue;
    ctx.fillStyle = b.playerIdx === 0 ? '#ffff40' : b.playerIdx === 1 ? '#40d0ff'
      : b.caste === 'queen' ? '#ff40c0' : '#e0b040';
    const sz = b.playerIdx >= 0 && (G.tick >> 3) % 2 ? 3 : 2;
    ctx.fillRect(mx + b.x * sx - 1, my + b.y * sy - 1, sz, sz);
  }
  ctx.fillStyle = '#ff3020';
  for (const t of G.threats) ctx.fillRect(mx + t.x * sx - 1, my + t.y * sy - 1, 2, 2);
  drawTextC(ctx, L('ui_closeMap'), VIEW_W / 2, my + mh + 8, '#a09070');
}

function drawPlay() {
  if (G.playerCount === 1) {
    drawViewport(G.players[0], 0, 0, VIEW_W, VIEW_H - HUD_H);
  } else {
    ctx.fillStyle = '#000';
    if (G.splitVert) ctx.fillRect((VIEW_W - 2) / 2, 0, 2, VIEW_H - HUD_H);
    else ctx.fillRect(0, (VIEW_H - HUD_H - 2) / 2, VIEW_W, 2);
    for (let i = 0; i < 2; i++) {
      const v = playerView(i);
      drawViewport(G.players[i], v.vx, v.vy, v.vw, v.vh);
    }
  }
  drawHud();
  drawBossBar();
  drawTaskAndMsgs();
  if (G.showMap) drawMinimap();
}

// boss health bar, shown above the HUD whenever a boss is on the field
function drawBossBar() {
  let boss = null;
  for (const t of G.threats) if (t.boss && !t.dead) { boss = t; break; }
  if (!boss) return;
  const w = 184, x = (VIEW_W - w) / 2, y = VIEW_H - HUD_H - 10, h = 8;
  ctx.fillStyle = '#000'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#3a0e08'; ctx.fillRect(x, y, w, h);
  const pct = Math.max(0, boss.hp / boss.maxHp);
  const enr = pct < 0.3;
  ctx.fillStyle = enr && (G.tick >> 2 & 1) ? '#ff7842' : '#d8301a';
  ctx.fillRect(x + 1, y + 1, Math.round((w - 2) * pct), h - 2);
  drawTextCS(ctx, L('boss_name'), VIEW_W / 2, y + 1, '#ffd8b0');
}

// ---------------------------------------------------------------------------
// menus & screens
// ---------------------------------------------------------------------------
function menuNav(n) {
  let moved = false;
  if (tookPress('ArrowUp') || tookPress('KeyW')) { G.menuSel = (G.menuSel + n - 1) % n; moved = true; }
  if (tookPress('ArrowDown') || tookPress('KeyS')) { G.menuSel = (G.menuSel + 1) % n; moved = true; }
  if (moved) Sfx.play('menu');
  return tookPress('Enter') || tookPress('Space');
}

// title-screen bees drifting across
const titleBees = [];
for (let i = 0; i < 6; i++) titleBees.push({ x: Math.random() * VIEW_W, y: 30 + Math.random() * 150, ph: Math.random() * 10, sp: 0.3 + Math.random() * 0.5, dir: Math.random() < 0.5 ? -1 : 1, wob: Math.random() * 10 });

function drawTitle() {
  // honey-warm backdrop
  for (let y = 0; y < VIEW_H; y += 2) {
    const t = y / VIEW_H;
    ctx.fillStyle = `rgb(${30 + t * 40 | 0},${20 + t * 24 | 0},${8 + t * 10 | 0})`;
    ctx.fillRect(0, y, VIEW_W, 2);
  }
  // honeycomb speckle
  ctx.fillStyle = '#3a2810';
  for (let i = 0; i < 160; i++) { const h = pxHash(i, 7); ctx.fillRect(h % VIEW_W, 30 + (h >> 9) % 160, 1, 1); }

  // drifting bees
  for (const tb of titleBees) {
    tb.x += tb.sp * tb.dir; tb.wob += 0.1;
    tb.y += Math.sin(tb.wob) * 0.4;
    if (tb.x < -10) tb.x = VIEW_W + 10; if (tb.x > VIEW_W + 10) tb.x = -10;
    const fake = { x: tb.x, y: tb.y, dir: tb.dir, vx: tb.dir, vy: 0, phase: tb.wob, wing: tb.wob * 6,
      def: CASTE.worker, caste: 'worker', flash: 0, nectar: 0, pollen: 0, playerIdx: -1, draw: Bee.prototype.draw };
    fake.draw(ctx, 0, 0);
  }

  const ly = 44;
  drawTextC(ctx, 'BIER', VIEW_W / 2 + 3, ly + 3, '#3a2206', 7);
  drawTextC(ctx, 'BIER', VIEW_W / 2, ly, '#e8a820', 7);
  drawTextC(ctx, 'BIER', VIEW_W / 2 - 1, ly - 1, '#ffd860', 7);
  drawTextCS(ctx, L('ui_tagline'), VIEW_W / 2, ly + 56, '#c8a868');

  const items = [L('ui_start'), L('ui_help'),
    L('ui_sound', L(Sfx.muted ? 'w_off' : 'w_on')),
    L('ui_crt', L(document.getElementById('crt').classList.contains('off') ? 'w_off' : 'w_on')),
    L('ui_lang')];
  const my = 118;
  for (let i = 0; i < items.length; i++) {
    const sel = i === G.menuSel;
    if (sel) drawTextC(ctx, '\x06', VIEW_W / 2 - textWidth(items[i]) / 2 - 12, my + i * 12, '#ffe040');
    drawTextCS(ctx, items[i], VIEW_W / 2, my + i * 12, sel ? '#ffe040' : '#c8b890');
  }
  drawTextC(ctx, L('ui_copyright'), VIEW_W / 2, VIEW_H - 12, '#6a5430');
}

function updateTitle() {
  if (menuNav(5)) {
    Sfx.play('select');
    switch (G.menuSel) {
      case 0: G.state = 'slots'; G.slotSel = 0; G.eraseArm = -1; break;
      case 1: G.prevState = 'title'; G.state = 'help'; break;
      case 2: Sfx.toggleMute(); break;
      case 3: document.getElementById('crt').classList.toggle('off'); break;
      case 4: setLang(LANG === 0); break;
    }
  }
}

function drawSlots() {
  ctx.fillStyle = '#170f06'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCS(ctx, L('ui_choose'), VIEW_W / 2, 18, '#e8a820', 2);
  for (let i = 0; i < 3; i++) {
    const info = slotInfo(i + 1);
    const sy = 52 + i * 34;
    const sel = i === G.slotSel;
    bevelPanel(40, sy - 4, 240, 28);
    if (sel) {
      ctx.fillStyle = '#ffe040';
      ctx.fillRect(40, sy - 4, 240, 1); ctx.fillRect(40, sy + 23, 240, 1);
      ctx.fillRect(40, sy - 4, 1, 28); ctx.fillRect(279, sy - 4, 1, 28);
      drawText(ctx, '\x06', 28, sy + 5, '#ffe040');
    }
    drawText(ctx, L('ui_hive', i + 1), 48, sy, sel ? '#ffe040' : '#c8b890');
    if (info) {
      drawText(ctx, L('w_day') + ' ' + (info.day + 1) + '  \x02' + info.bees + '  \x01' + info.honey + '  ' + L('ui_score', info.score), 48, sy + 10, '#a09070');
      if (G.eraseArm === i) drawText(ctx, L('ui_eraseArm'), 180, sy, '#ff5040');
    } else { drawText(ctx, L('ui_empty'), 48, sy + 10, '#706050'); }
  }
  drawTextC(ctx, L('ui_slotKeys'), VIEW_W / 2, 164, '#b0a080');
  drawTextC(ctx, L('ui_slotKeys2'), VIEW_W / 2, 176, '#706050');
}

function updateSlots() {
  if (tookPress('ArrowUp') || tookPress('KeyW')) { G.slotSel = (G.slotSel + 2) % 3; G.eraseArm = -1; Sfx.play('menu'); }
  if (tookPress('ArrowDown') || tookPress('KeyS')) { G.slotSel = (G.slotSel + 1) % 3; G.eraseArm = -1; Sfx.play('menu'); }
  if (tookPress('Escape')) { G.state = 'title'; return; }
  if (tookPress('KeyX')) {
    if (G.eraseArm === G.slotSel && slotInfo(G.slotSel + 1)) { deleteWorld(G.slotSel + 1); G.eraseArm = -1; Sfx.play('kill'); }
    else if (slotInfo(G.slotSel + 1)) { G.eraseArm = G.slotSel; Sfx.play('menu'); }
  }
  let pc = 0;
  if (tookPress('Enter') || tookPress('Space')) pc = 1;
  if (tookPress('KeyT')) pc = 2;
  if (pc) {
    Sfx.play('select');
    const slot = G.slotSel + 1;
    if (slotInfo(slot) && loadWorld(slot, pc)) { G.state = 'play'; G.msg(L('m_welcome')); }
    else { newWorld(slot, pc); G.state = 'intro'; G.introLine = 0; }
  }
}

function drawIntro() {
  ctx.fillStyle = '#170f06'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const lines = introText();
  G.introLine += 0.4;
  const shown = Math.min(lines.length, Math.floor(G.introLine / 6) + 1);
  let y = 24;
  for (let i = 0; i < shown; i++) {
    drawTextC(ctx, lines[i], VIEW_W / 2, y, i >= lines.length - 2 ? '#e8a820' : '#c8b890');
    y += 11;
  }
  if (shown >= lines.length && (G.tick >> 4) % 2 === 0) drawTextC(ctx, L('ui_pressSpace'), VIEW_W / 2, 188, '#ffe040');
  G.tick++;
}

function updateIntro() {
  if (tookPress('Space') || tookPress('Enter')) { G.state = 'play'; G.msg(L('m_flyOut'), '#a0e080'); Sfx.play('select'); }
}

function drawHelp() {
  ctx.fillStyle = '#170f06'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  drawTextCS(ctx, L('ui_howto'), VIEW_W / 2, 12, '#e8a820', 2);
  let y = 38;
  for (const [line, color] of helpText()) { if (line) drawText(ctx, line, 18, y, color); y += 12; }
  drawTextC(ctx, L('ui_escBack'), VIEW_W / 2, 188, '#706050');
}

function updateHelp() {
  if (tookPress('Escape') || tookPress('Enter') || tookPress('Space')) { G.state = G.prevState === 'pause' ? 'pause' : G.prevState; Sfx.play('menu'); }
}

// pause-menu items -- the SPLIT orientation toggle only appears in 2-player
function pauseItems() {
  const items = [
    { id: 'resume', label: L('ui_resume') },
    { id: 'save', label: L('ui_saveGame') },
    { id: 'help', label: L('ui_help') },
  ];
  if (G.playerCount > 1) items.push({ id: 'split', label: L('ui_split', L(G.splitVert ? 'ui_vert' : 'ui_horiz')) });
  items.push({ id: 'quit', label: L('ui_saveQuit') });
  return items;
}

function drawPause() {
  drawPlay();
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const items = pauseItems();
  bevelPanel(96, 56, 128, 40 + items.length * 12);
  drawTextCS(ctx, L('ui_paused'), VIEW_W / 2, 64, '#e8a820', 2);
  for (let i = 0; i < items.length; i++) {
    const sel = i === G.menuSel;
    if (sel) drawText(ctx, '\x06', 106, 88 + i * 12, '#ffe040');
    drawText(ctx, items[i].label, 118, 88 + i * 12, sel ? '#ffe040' : '#c8b890');
  }
}

function updatePause() {
  if (tookPress('Escape')) { G.state = 'play'; return; }
  const items = pauseItems();
  if (G.menuSel >= items.length) G.menuSel = items.length - 1;
  if (menuNav(items.length)) {
    Sfx.play('select');
    switch (items[G.menuSel].id) {
      case 'resume': G.state = 'play'; break;
      case 'save': if (saveWorld(G.slot)) { G.msg(L('m_saved'), '#80c0ff'); Sfx.play('save'); } G.state = 'play'; break;
      case 'help': G.prevState = 'pause'; G.state = 'help'; break;
      case 'split':
        G.splitVert = !G.splitVert;
        try { localStorage.setItem('bier_split', G.splitVert ? 'v' : 'h'); } catch (e) {}
        break;
      case 'quit': saveWorld(G.slot); G.running = false; G.state = 'title'; G.menuSel = 0; break;
    }
  }
}

function drawDead() {
  drawPlay();
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const tk = G.takeover;
  if (!tk) return;
  const sw = !!tk.prevBee;            // live switch vs death takeover
  bevelPanel(70, 30, 180, 140);
  const pcol = tk.pIdx === 0 ? '#ffe080' : '#80d0ff';
  const ptag = G.playerCount > 1 ? L('ui_player', tk.pIdx + 1) + ' ' : '';
  drawTextCS(ctx, ptag + (sw ? L('ui_switchBee') : L('ui_beeLost')), VIEW_W / 2, 38, sw ? pcol : '#ff5040', 2);
  if (!sw) drawTextC(ctx, L('ui_hiveLives'), VIEW_W / 2, 58, '#c8b890');
  drawTextC(ctx, L('ui_continueAs'), VIEW_W / 2, 70, pcol);
  for (let i = 0; i < tk.list.length; i++) {
    const a = tk.list[i];
    const sel = i === tk.sel;
    const label = L('ui_hp', casteName(a.caste), Math.ceil(a.hp), a.maxHp);
    if (sel) drawText(ctx, '\x06', 92, 84 + i * 12, '#ffe040');
    drawText(ctx, label, 104, 84 + i * 12, sel ? '#ffe040' : '#c8b890');
  }
  drawTextC(ctx, sw ? L('ui_switchKeys') : L('ui_takeOver'), VIEW_W / 2, 160, '#a09070');
}

function updateDead() {
  const tk = G.takeover;
  if (!tk) { G.state = 'play'; return; }
  const sw = !!tk.prevBee;
  // a live switch is cancellable; a death takeover is not
  if (sw && tookPress('Escape')) { G.takeover = null; G.state = 'play'; Sfx.play('menu'); return; }
  tk.list = tk.list.filter(a => a.hp > 0 && a.playerIdx < 0);
  if (tk.list.length === 0) {
    if (sw) { G.takeover = null; G.state = 'play'; G.msg(L('m_noSwitch'), '#ff8040'); return; }
    endWorld(); return;
  }
  tk.sel = Math.min(tk.sel, tk.list.length - 1);
  if (tookPress('ArrowUp') || tookPress('KeyW')) { tk.sel = (tk.sel + tk.list.length - 1) % tk.list.length; Sfx.play('menu'); }
  if (tookPress('ArrowDown') || tookPress('KeyS')) { tk.sel = (tk.sel + 1) % tk.list.length; Sfx.play('menu'); }
  if (tookPress('Enter') || tookPress('Space')) {
    const a = tk.list[tk.sel];
    if (sw) {
      // release the current bee back into the colony
      const prev = tk.prevBee;
      if (prev && prev.hp > 0) { prev.playerIdx = -1; prev.state = 'idle'; prev.stateT = 30; }
    } else {
      G.deadQueue.shift();
    }
    a.playerIdx = tk.pIdx; a.state = 'idle'; a.layerCd = 18;
    G.players[tk.pIdx].bee = a;
    G.players[tk.pIdx].trans = null;
    G.players[tk.pIdx].cam = { x: a.x - VIEW_W / 2, y: a.y - 60 };
    G.takeover = null; G.state = 'play';
    G.msg(L('m_nowFlying', casteName(a.caste)), tk.pIdx === 0 ? '#ffe080' : '#80d0ff');
    Sfx.play('select');
  }
}

function drawEnd(won) {
  ctx.fillStyle = '#170f06'; ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const s = G.endStats;
  if (won) {
    drawTextCS(ctx, L('ui_win1'), VIEW_W / 2, 22, '#ffd040', 2);
    drawTextCS(ctx, L('ui_win2'), VIEW_W / 2, 40, '#ffd040', 2);
  } else {
    drawTextCS(ctx, L('ui_lose1'), VIEW_W / 2, 24, '#ff5040', 2);
    drawTextCS(ctx, L('ui_lose2'), VIEW_W / 2, 42, '#ff5040', 2);
  }
  if (s) {
    const lines = [
      [L('ui_lasted', s.day + 1), '#c8b890'],
      [L('ui_finalScore', s.score), '#ffe040'],
      [L('ui_honeyStored', Math.floor(s.stats.honeyStored)), '#e8b830'],
      [L('ui_broodRaised', s.stats.broodRaised), '#a09070'],
      [L('ui_beesBorn', s.stats.beesBorn), '#a09070'],
      [L('ui_beesLost', s.stats.beesLost), '#a09070'],
      [L('ui_threatsSlain', s.stats.threatsSlain), '#a09070'],
    ];
    let y = 72;
    for (const [line, color] of lines) { drawTextC(ctx, line, VIEW_W / 2, y, color); y += 12; }
  }
  if ((G.tick >> 4) % 2 === 0) drawTextC(ctx, L('ui_pressEnter'), VIEW_W / 2, 184, '#ffe040');
  G.tick++;
}

function updateEnd() {
  if (tookPress('Enter') || tookPress('Space') || tookPress('Escape')) { G.state = 'title'; G.menuSel = 0; Sfx.play('select'); }
}

// ---------------------------------------------------------------------------
// global toggles + loop
// ---------------------------------------------------------------------------
function globalKeys() {
  if (tookPress('KeyC')) document.getElementById('crt').classList.toggle('off');
  if (tookPress('KeyN')) { const m = Sfx.toggleMute(); if (G.state === 'play') G.msg(L('m_sound', L(m ? 'w_off' : 'w_on')), '#80c0ff'); }
}

let last = 0, acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  acc += Math.min(100, now - last);
  last = now;
  const STEP = 1000 / 60;
  let steps = 0;
  while (acc >= STEP && steps < 4) {
    acc -= STEP; steps++;
    globalKeys();
    switch (G.state) {
      case 'title': updateTitle(); break;
      case 'slots': updateSlots(); break;
      case 'intro': updateIntro(); break;
      case 'help': updateHelp(); break;
      case 'play': updatePlay(); break;
      case 'pause': updatePause(); break;
      case 'dead': updateDead(); break;
      case 'gameover': updateEnd(); break;
      case 'win': updateEnd(); break;
    }
    for (const kk in pressed) pressed[kk] = false;
  }
  if (G.state !== 'play') Sfx.setBuzz(0);

  switch (G.state) {
    case 'title': drawTitle(); break;
    case 'slots': drawSlots(); break;
    case 'intro': drawIntro(); break;
    case 'help': drawHelp(); break;
    case 'play': drawPlay(); break;
    case 'pause': drawPause(); break;
    case 'dead': drawDead(); break;
    case 'gameover': drawEnd(false); break;
    case 'win': drawEnd(true); break;
  }
}

function fitCanvas() {
  const scale = Math.max(1, Math.min(Math.floor(window.innerWidth / VIEW_W), Math.floor(window.innerHeight / VIEW_H)));
  const stage = document.getElementById('stage');
  stage.style.width = (VIEW_W * scale) + 'px';
  stage.style.height = (VIEW_H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

window.addEventListener('beforeunload', () => { if (G.running) saveWorld(G.slot); });

requestAnimationFrame(frame);
