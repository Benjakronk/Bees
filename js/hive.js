// BIER -- hive simulation: stores, brood cycle, the queen, tasks, threats,
// and the march of the seasons toward winter. The hive lives on its own; the
// player is one bee among many.
'use strict';

const DAY_LEN = 60 * 180;     // 3 minutes of frames per day
const POP_CAP = 38;
const WINTER_DAY = 10;        // reach winter, well-stocked, and you win
const WINTER_GOAL = 300;      // honey units needed to overwinter

const SEASONS = [
  { name: 'SPRING', until: 2, bloom: 1.05 },
  { name: 'SUMMER', until: 6, bloom: 1.30 },
  { name: 'AUTUMN', until: 9, bloom: 0.70 },
  { name: 'WINTER', until: 99, bloom: 0.22 },
];

class Hive {
  constructor(geo) {
    this.geo = geo;
    this.honeyUnits = 0;
    this.pollenUnits = 0;
    this.broodCount = 0;
    this.emptyCells = 0;
    this.score = 0;
    this.eggT = 600;
    this.statT = 0;
    this.taskT = 0;
    this.tasks = [];
    this.starveT = 0;
    this.lastThreatDay = -1;
    this.lastDigTaskDay = -1;
    this.won = false;
    this.stats = {
      nectarGathered: 0, broodRaised: 0, beesBorn: 0,
      beesLost: 0, threatsSlain: 0, honeyStored: 0,
    };
    this.refreshTotals();
  }

  season() {
    const d = G.day;
    for (const s of SEASONS) if (d <= s.until) return s;
    return SEASONS[SEASONS.length - 1];
  }

  refreshTotals() {
    const t = Comb.totals();
    this.honeyUnits = t.honeyUnits;
    this.pollenUnits = t.pollenUnits;
    this.broodCount = t.brood;
    this.emptyCells = t.empty;
    this.buildable = t.buildable;
    if (t.honeyUnits > this.stats.honeyStored) this.stats.honeyStored = Math.round(t.honeyUnits);
  }

  // expand the comb when stores are healthy but storage space is running short
  wantBuild() { return this.honeyUnits > 70 && this.emptyCells < 16 && this.buildable > 0; }

  pop() { return G.bees.filter(b => b.hp > 0).length; }
  needNurses() { return this.pollenUnits > 2; }

  // bees forage on demand: hard when stores run low, easing off when the comb
  // is well stocked. This self-regulates the economy around a target instead of
  // overflowing -- and robbers/winter draining honey reignites the workforce.
  foragingDrive() { return clamp((380 - this.honeyUnits) / 120, 0, 1); }
  pollenSated() { return this.pollenUnits > 220; }

  // ----- update -------------------------------------------------------------
  update() {
    if (this.statT-- <= 0) { this.statT = 20; this.refreshTotals(); }
    const pop = this.pop();

    Comb.ripenStep();
    this.broodCycle();
    this.queenLays(pop);

    // upkeep: the colony eats honey; more at night and in lean seasons
    const night = G.isNight();
    const rate = 0.00030 * (night ? 1.6 : 1) * (this.season().bloom < 0.8 ? 1.5 : 1);
    const eaten = pop * rate;
    if (this.honeyUnits > 0) { Comb.drainHoney(eaten); }
    else if (pop > 0) {
      for (const b of G.bees) if (b.hp > 0) b.hp -= 0.006;
      if (this.starveT <= 0) {
        G.msg('THE HIVE IS STARVING!', '#ff6040'); Sfx.play('starve');
        this.starveT = 1800;
      }
    }
    if (this.starveT > 0) this.starveT--;

    // tasks
    if (this.taskT-- <= 0) { this.taskT = 180; this.generateTasks(); }
    this.checkTasks();
    for (const t of this.tasks) if (t.done && t.doneT > 0) t.doneT--;
    this.tasks = this.tasks.filter(t => !t.done || t.doneT > 0);

    this.spawnThreats();

    // victory: reach winter with the larder full
    if (!this.won && G.day >= WINTER_DAY && this.honeyUnits >= WINTER_GOAL) {
      this.won = true;
      G.winGame();
    }
  }

  // ----- brood --------------------------------------------------------------
  broodCycle() {
    for (const c of Comb.cells) {
      if (c.type === 'egg') {
        c.age++;
        if (c.age > EGG_TIME) { c.type = 'larva'; c.age = 0; c.fed = 0; c.hungry = false; c.hungerT = 360; }
      } else if (c.type === 'larva') {
        c.age++;
        if (c.hungerT === undefined) c.hungerT = 360;
        c.hungerT--;
        if (c.hungerT <= 0 && !c.hungry && c.fed < LARVA_FEEDS) c.hungry = true;
        // a fed larva consumes a little honey
        if (c.hungry && c.hungerT < -2400) { // starved
          c.type = 'empty'; c.amount = 0; c.hungry = false;
          continue;
        }
        if (c.age > LARVA_TIME) {
          if (c.fed >= LARVA_FEEDS - 1) {
            c.type = 'pupa'; c.capped = true; c.age = 0;
          } else {
            c.type = 'empty'; c.amount = 0; c.hungry = false; // failed to thrive
          }
        }
      } else if (c.type === 'pupa') {
        c.age++;
        if (c.age > PUPA_TIME) { this.hatch(c); }
      }
    }
  }

  // a larva is fed (by a nurse or the player): costs a little honey
  feedLarva(c) {
    if (c.type !== 'larva' || !c.hungry) return false;
    c.hungry = false; c.fed++;
    c.hungerT = 540 + Math.random() * 420;
    Comb.drainHoney(0.3);     // grubs eat honey...
    Comb.drainPollen(0.4);    // ...and pollen (bee bread), so pollen is a real sink
    return true;
  }

  hatch(c) {
    const isQueen = c.queen;
    c.type = 'empty'; c.amount = 0; c.capped = false; c.queen = false; c.age = 0;
    let caste;
    if (isQueen) caste = 'queen';
    else {
      const pop = this.pop();
      const guards = G.bees.filter(b => b.caste === 'guard' && b.hp > 0).length;
      const drones = G.bees.filter(b => b.caste === 'drone' && b.hp > 0).length;
      if (guards < pop * 0.16 && Math.random() < 0.4) caste = 'guard';
      else if (drones < pop * 0.1 && Math.random() < 0.2) caste = 'drone';
      else caste = 'worker';
    }
    if (this.pop() >= POP_CAP && !isQueen) return; // crowded: pupa just vanishes (swarm flew off)
    const b = new Bee(c.x, c.y - 2, caste);
    b.state = 'idle'; b.stateT = 30;
    G.bees.push(b);
    this.stats.beesBorn++;
    this.stats.broodRaised++;
    G.msg('A NEW ' + caste.toUpperCase() + ' EMERGES', caste === 'queen' ? '#ffd040' : '#e8c060');
    if (G.nearPlayer(c.x, c.y) < 300) Sfx.play('hatch');
  }

  // ----- the queen ----------------------------------------------------------
  queenLays(pop) {
    let queen = G.bees.find(b => b.caste === 'queen' && b.hp > 0);

    // emergency queen-rearing: no queen, but brood remains -> raise a new one
    if (!queen) {
      const pending = Comb.cells.some(c => c.queen);
      if (!pending) {
        const young = Comb.cells.find(c => c.type === 'larva' && c.age < LARVA_TIME * 0.5);
        if (young) {
          young.queen = true;
          G.msg('THE COLONY RAISES A NEW QUEEN', '#ffd040');
        }
      }
      return;
    }

    this.eggT--;
    const season = this.season();
    // only grow when there's a real honey surplus, and never overcrowd
    const layOk = this.honeyUnits >= 45 && this.broodCount < 12 &&
                  pop + this.broodCount < POP_CAP - 2 &&
                  (season.name === 'SPRING' || season.name === 'SUMMER');
    if (this.eggT <= 0 && layOk) {
      const cell = Comb.emptyNear(queen.x, queen.y, 70, 'brood') ||
                   Comb.emptyNear(this.geo.broodCx, this.geo.broodCy, 9999, 'brood');
      if (cell) {
        cell.type = 'egg'; cell.age = 0;
        Comb.drainHoney(1.5);
        this.eggT = Math.round(620 / season.bloom);
        if (G.nearPlayer(queen.x, queen.y) < 300) Sfx.play('lay');
      } else { this.eggT = 300; }
    } else if (this.eggT <= 0) { this.eggT = 360; }
  }

  // ----- tasks --------------------------------------------------------------
  active(type) { return this.tasks.find(t => t.type === type && !t.done); }

  generateTasks() {
    const tasks = this.tasks;
    if (tasks.filter(t => !t.done).length >= 3) return;

    if (this.honeyUnits < WINTER_GOAL * 0.5 && !this.active('gather')) {
      tasks.push({ type: 'gather', text: 'GATHER NECTAR', n: 0, need: 8, reward: 50 });
      G.msg('NEW TASK: GATHER NECTAR', '#a0e080');
    }
    const hungry = Comb.cells.filter(c => c.type === 'larva' && c.hungry).length;
    if (hungry >= 2 && !this.active('feed')) {
      tasks.push({ type: 'feed', text: 'FEED THE BROOD', n: 0, need: Math.min(3, hungry), reward: 45 });
      G.msg('NEW TASK: FEED THE BROOD', '#a0e080');
    }
    if (this.buildable > 0 && this.emptyCells < 8 && this.honeyUnits > 60 && !this.active('build')) {
      tasks.push({ type: 'build', text: 'BUILD MORE COMB', n: 0, need: 3, reward: 45 });
      G.msg('NEW TASK: BUILD MORE COMB', '#a0e080');
    }
    const threat = G.threats.find(t => !t.dead && !t.fleeing &&
      Math.abs(t.x - this.geo.x) < 360);
    if (threat && !this.active('repel')) {
      tasks.push({ type: 'repel', text: 'REPEL THE ' + threat.kind.toUpperCase(), targetId: threat.id, n: 0, need: 1, reward: 90 });
      G.msg('NEW TASK: DEFEND THE HIVE!', '#ff8040');
      Sfx.play('alarm');
    }
    if (G.day > this.lastDigTaskDay && this.honeyUnits >= WINTER_GOAL * 0.7 && !this.active('store')) {
      this.lastDigTaskDay = G.day;
      tasks.push({ type: 'store', text: 'STOCK HONEY FOR WINTER', n: Math.floor(this.honeyUnits), need: WINTER_GOAL, reward: 80, track: true });
    }
  }

  progress(type, n) {
    const t = this.active(type);
    if (!t) return;
    t.n += n;
    if (t.n >= t.need) this.complete(t);
  }

  complete(t) {
    t.done = true; t.doneT = 240;
    this.score += t.reward;
    G.msg('TASK COMPLETE! +' + t.reward, '#ffe040');
    Sfx.play('task');
  }

  checkTasks() {
    const store = this.active('store');
    if (store && store.track) { store.n = Math.floor(this.honeyUnits); if (store.n >= store.need) this.complete(store); }
    const repel = this.active('repel');
    if (repel) {
      const tgt = G.threats.find(t => t.id === repel.targetId);
      if (!tgt || tgt.dead || tgt.fleeing) this.complete(repel);
    }
  }

  // ----- threats ------------------------------------------------------------
  spawnThreats() {
    const day = G.day, night = G.isNight();
    const count = k => G.threats.filter(t => t.kind === k && !t.dead).length;
    const surfAt = x => T.surf[clamp(x | 0, 0, WORLD_W - 1)];

    // wasps: day-flying hunters, escalating
    const waspCap = Math.min(4, 1 + Math.floor(day / 2));
    if (!night && count('wasp') < waspCap && day >= 1 && Math.random() < 0.0009) {
      const x = Math.random() < 0.5 ? 40 : WORLD_W - 40;
      G.threats.push(new Threat(x, surfAt(x) - 60, 'wasp'));
      G.msg('A WASP IS ON THE HUNT!', '#ff8040'); Sfx.play('alarm');
    }
    // robber bees: come when the hive is rich
    if (count('robber') < 3 && day >= 2 && this.honeyUnits > 80 && Math.random() < 0.0007) {
      const x = Math.random() < 0.5 ? 40 : WORLD_W - 40;
      G.threats.push(new Threat(x, surfAt(x) - 50, 'robber'));
      G.msg('ROBBER BEES! GUARD THE HONEY!', '#ff8040'); Sfx.play('alarm');
    }
    // spider: spins a web near the entrance
    if (count('spider') < 1 && day >= 2 && Math.random() < 0.0003) {
      const h = this.geo;
      const ax = h.outer.x + h.entSide * (10 + Math.random() * 20);
      const ay = h.entrance.y - 30 - Math.random() * 20;
      G.threats.push(new Threat(ax, ay, 'spider'));
      G.msg('A SPIDER LURKS BY THE DOOR...', '#ff8040');
    }
    // hornet: rare heavyweight that raids the brood
    if (count('hornet') < 1 && day >= 4 && Math.random() < 0.00018) {
      const x = Math.random() < 0.5 ? 40 : WORLD_W - 40;
      G.threats.push(new Threat(x, surfAt(x) - 70, 'hornet'));
      G.msg('A HORNET! THE BROOD IS IN DANGER!', '#ff5030'); Sfx.play('alarm');
    }
  }
}
