// BIER -- save / load. Three slots in localStorage. The terrain is fully
// regenerable from the seed, so we only persist the living state.
'use strict';

const SAVE_PREFIX = 'bier_hive_';

function saveWorld(slot) {
  if (!G || !G.running) return false;
  const Hv = G.hive;
  const data = {
    v: 1,
    seed: G.seed,
    tick: G.tick,
    playerCount: G.playerCount,
    nextId: ENT_ID,
    cells: Comb.serialize(),
    bees: G.bees.filter(b => b.hp > 0).map(b => ({
      id: b.id, caste: b.caste, x: Math.round(b.x), y: Math.round(b.y),
      hp: Math.round(b.hp * 10) / 10, playerIdx: b.playerIdx,
      nectar: Math.round(b.nectar * 10) / 10, pollen: Math.round(b.pollen * 10) / 10,
    })),
    flowers: G.flowers.map(f => ({
      id: f.id, kind: f.kind, x: f.x, y: f.y,
      nectar: Math.round(f.nectar * 10) / 10, pollen: Math.round(f.pollen * 10) / 10,
    })),
    threats: G.threats.filter(t => !t.dead).map(t => ({
      id: t.id, kind: t.kind, x: Math.round(t.x), y: Math.round(t.y),
      hp: Math.round(t.hp), fleeing: t.fleeing, loot: t.loot,
      anchorX: t.anchorX, anchorY: t.anchorY,
    })),
    hive: {
      score: Hv.score, eggT: Hv.eggT, won: Hv.won,
      lastDigTaskDay: Hv.lastDigTaskDay, lastThreatDay: Hv.lastThreatDay,
      tasks: Hv.tasks.filter(t => !t.done), stats: Hv.stats,
    },
  };
  try {
    localStorage.setItem(SAVE_PREFIX + slot, JSON.stringify(data));
    return true;
  } catch (e) { console.error('save failed', e); return false; }
}

function loadWorldData(slot) {
  const raw = localStorage.getItem(SAVE_PREFIX + slot);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function slotInfo(slot) {
  const d = loadWorldData(slot);
  if (!d) return null;
  try {
    return {
      day: Math.floor(d.tick / DAY_LEN),
      bees: d.bees.length,
      honey: Math.round((d.hive && d.hive.stats ? d.hive.stats.honeyStored : 0)),
      score: d.hive.score, playerCount: d.playerCount,
    };
  } catch (e) { return null; }
}

function deleteWorld(slot) { localStorage.removeItem(SAVE_PREFIX + slot); }
