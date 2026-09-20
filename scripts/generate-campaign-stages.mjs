#!/usr/bin/env node
/**
 * Build the forged tail of the Goblin campaign.
 *
 * The pinned client ships 90 Goblin map villages and 19 Challenges, and nothing else this
 * game can play. The villages past those are this project's own, laid out here rather than
 * by hand so that every one is reproducible and every entity it places is a level the pinned
 * source already proves: only `(GlobalID, level)` pairs that appear in an imported village
 * are used, so hitpoints, damage and artwork are the audited ones.
 *
 * Run from the repository root. --check compares without writing.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RUNTIME = path.join(ROOT, 'reference/campaign/runtime.json');
const DEST = path.join(ROOT, 'reference/campaign/generated.json');
/** The campaign's full length, counting the imported villages this tail follows. */
const CAMPAIGN_LENGTH = 150;
/** Buildable square: the native 44 tiles, before the simulation's two-tile border. */
const AREA = 44;
/** Tiles kept clear around every forged village, so an attack always has room to deploy. */
const MARGIN = 3;
/** Wall rings between the garrison and that margin. */
const RINGS = 3;

const runtime = JSON.parse(fs.readFileSync(RUNTIME, 'utf8'));
const combat = Object.fromEntries(
  Object.entries(runtime.combat).map(([id, value]) => [Number(id), value]),
);
/** Levels of each entity that an imported village already places. */
const proven = new Map();
for (const stage of runtime.stages)
  for (const list of [stage.buildings, stage.traps])
    for (const [id, , , level] of list) {
      if (!proven.has(id)) proven.set(id, new Set());
      proven.get(id).add(level);
    }
const byName = Object.fromEntries(
  Object.entries(combat).map(([id, value]) => [value.name, Number(id)]),
);
/** The proven level nearest to `target`, never above it unless nothing lower exists. */
function level(name, target) {
  const id = byName[name];
  const levels = [...(proven.get(id) ?? [])].sort((a, b) => a - b);
  if (!levels.length) throw new Error(`No imported village places ${name}`);
  const below = levels.filter((value) => value <= target);
  return below.length ? below.at(-1) : levels[0];
}
const size = (name) => combat[byName[name]].size;

/** Deterministic 32-bit PRNG, so every run lays out the same villages. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The villages, hardest last. Each names its Town Hall tier, which sets every building's
 * level and the size of its garrison, plus the loot it holds.
 */
const NAMES = [
  'Ashfall Bastion',
  'Widow’s Causeway',
  'The Brass Kettle',
  'Thornwake',
  'Gravelmarch',
  'Hollow Crown',
  'Saltpetre Yard',
  'The Weeping Gate',
  'Cinderhold',
  'Rooks’ Reach',
  'Bramblewatch',
  'The Iron Orchard',
  'Duskmire',
  'Gallows Field',
  'Kettledrum Keep',
  'The Long Winter',
  'Ravenscar',
  'Blackwater Mill',
  'Stormglass',
  'The Tallow Works',
  'Grimhollow',
  'Nettleford',
  'The Brazen Bull',
  'Coldharbour',
  'Wyrmrest',
  'The Shattered Anvil',
  'Mournhold',
  'Tinder Row',
  'The Gilded Cage',
  'Sablewatch',
  'Fetterlane',
  'The Quiet Siege',
  'Emberfall',
  'Ninestones',
  'The Hungry Dark',
  'Warden’s Folly',
  'Rustmere',
  'The Last Lantern',
  'Bonefold',
  'Highgallow',
  'The Sunken Court',
  'Ironmourne',
  'Vexford',
  'The Crown Unmade',
  'Ashen Reach',
  'The Final Furnace',
  'Kingsbane',
];
/** Town Hall tier of each forged village: a steady climb from nine to the catalog's top. */
const tier = (index, count) => 9 + Math.floor((index * 7) / Math.max(1, count - 1));

/** One village's garrison, as counts of each family for a Town Hall tier. */
function recipe(townhall, rng) {
  const spread = (base, per) => base + Math.round((townhall - 9) * per) + (rng() < 0.5 ? 0 : 1);
  return {
    Cannon: spread(4, 0.4),
    'Archer Tower': spread(4, 0.5),
    Mortar: spread(2, 0.25),
    'Air Defense': spread(2, 0.3),
    'Wizard Tower': spread(2, 0.4),
    'Hidden Tesla': spread(2, 0.4),
    'Air Sweeper': townhall >= 10 ? 2 : 1,
    'Bomb Tower': townhall >= 11 ? spread(1, 0.2) : 0,
    'X-Bow': townhall >= 12 ? spread(1, 0.4) : 0,
    'Gold Mine': spread(4, 0.3),
    'Elixir Collector': spread(4, 0.3),
    'Gold Storage': spread(2, 0.2),
    'Elixir Storage': spread(2, 0.2),
    'Dark Elixir Drill': townhall >= 10 ? 2 : 0,
    'Dark Elixir Storage': townhall >= 10 ? 1 : 0,
    'Army Camp': 2,
    Barracks: 1,
    Laboratory: 1,
    'Clan Castle': 0,
    'Builders Hut': 2,
    'Town Hall': 1,
  };
}
/** Traps, which fill the gaps the garrison leaves rather than taking room of their own. */
function traps(townhall, rng) {
  const spread = (base, per) => base + Math.round((townhall - 9) * per) + (rng() < 0.4 ? 1 : 0);
  return {
    Bomb: spread(5, 0.4),
    'Spring Trap': spread(3, 0.2),
    'Air Bomb': spread(3, 0.3),
    'Giant Bomb': spread(2, 0.3),
    'Seeking Air Mine': townhall >= 11 ? spread(2, 0.2) : 0,
    'Skeleton Trap': townhall >= 12 ? 2 : 0,
  };
}

/** Occupancy of the buildable square, in native coordinates. */
class Ground {
  constructor(inset) {
    this.taken = new Uint8Array(AREA * AREA);
    // How far in from the board edge anything may be placed. The garrison keeps clear of the
    // wall rings; the walls themselves only keep clear of the deployment margin.
    this.inset = inset;
  }
  free(x, y, span, pad) {
    const low = this.inset;
    const high = AREA - this.inset;
    if (x < low || y < low || x + span > high || y + span > high) return false;
    const x0 = Math.max(0, x - pad);
    const y0 = Math.max(0, y - pad);
    const x1 = Math.min(AREA, x + span + pad);
    const y1 = Math.min(AREA, y + span + pad);
    for (let ty = y0; ty < y1; ty++)
      for (let tx = x0; tx < x1; tx++) if (this.taken[ty * AREA + tx]) return false;
    return true;
  }
  occupy(x, y, span) {
    for (let ty = y; ty < y + span; ty++)
      for (let tx = x; tx < x + span; tx++) this.taken[ty * AREA + tx] = 1;
  }
}
/** Every tile, nearest the middle first: the order a village grows outward in. */
const SPIRAL = (() => {
  const middle = (AREA - 1) / 2;
  const tiles = [];
  for (let y = 0; y < AREA; y++) for (let x = 0; x < AREA; x++) tiles.push({ x, y });
  return tiles.sort(
    (a, b) =>
      Math.hypot(a.x - middle, a.y - middle) - Math.hypot(b.x - middle, b.y - middle) ||
      a.y - b.y ||
      a.x - b.x,
  );
})();

/**
 * Place one footprint at a free position, keeping `pad` tiles clear. `outward` searches from
 * the rim inwards instead of from the middle outwards, which is how half of each defensive
 * family is posted: a village whose defenses all huddle in the middle leaves a besieger free
 * to stand outside the wall and chip it down unopposed.
 */
function place(ground, span, pad, offset, outward = false) {
  for (let i = 0; i < SPIRAL.length; i++) {
    const at = (i + offset) % SPIRAL.length;
    const tile = SPIRAL[outward ? SPIRAL.length - 1 - at : at];
    const low = ground.inset;
    const x = Math.min(AREA - low - span, Math.max(low, tile.x - (span >> 1)));
    const y = Math.min(AREA - low - span, Math.max(low, tile.y - (span >> 1)));
    if (ground.free(x, y, span, pad)) {
      ground.occupy(x, y, span);
      return { x, y };
    }
  }
  return null;
}
/** The tiles of one rectangle outline, clockwise, clipped to the buildable square. */
function border(x0, y0, x1, y1) {
  const tiles = [];
  const push = (x, y) => {
    if (x >= MARGIN && y >= MARGIN && x < AREA - MARGIN && y < AREA - MARGIN) tiles.push({ x, y });
  };
  if (x1 < x0 || y1 < y0) return tiles;
  for (let x = x0; x <= x1; x++) push(x, y0);
  for (let y = y0 + 1; y <= y1; y++) push(x1, y);
  for (let x = x1 - 1; x >= x0; x--) push(x, y1);
  for (let y = y1 - 1; y > y0; y--) push(x0, y);
  return tiles;
}

function village(index, count) {
  const townhall = tier(index, count);
  const rng = random(0x5eed + index * 7919);
  const ground = new Ground(MARGIN + RINGS);
  const buildings = [];
  const trapList = [];
  const push = (list, name, at, value) => list.push([byName[name], at.x, at.y, value]);
  // The Town Hall holds the middle; the rest of the garrison grows around it.
  const hall = place(ground, size('Town Hall'), 1, 0);
  push(buildings, 'Town Hall', hall, level('Town Hall', townhall));
  const families = Object.entries(recipe(townhall, rng))
    .filter(([name, n]) => n > 0 && name !== 'Town Hall')
    // Widest first, so the one-tile families fill what the others leave.
    .sort((a, b) => size(b[0]) - size(a[0]) || (a[0] < b[0] ? -1 : 1));
  const RIM = new Set(['Cannon', 'Archer Tower', 'Wizard Tower', 'Hidden Tesla', 'Air Defense']);
  for (const [name, n] of families)
    for (let i = 0; i < n; i++) {
      const outward = RIM.has(name) && i % 2 === 1;
      const at = place(ground, size(name), 1, Math.floor(rng() * SPIRAL.length), outward);
      if (at) push(buildings, name, at, level(name, townhall));
    }
  // Traps take the leftover gaps, keeping the same tile of walking room: a trap wedged into
  // a hole can seal a pocket that a troop inside it can never path out of.
  for (const [name, n] of Object.entries(traps(townhall, rng)))
    for (let i = 0; i < n; i++) {
      const at = place(ground, size(name), 1, Math.floor(rng() * SPIRAL.length));
      if (at) push(trapList, name, at, level(name, townhall));
    }
  // Walls ring the result, innermost ring first.
  const extent = (pick) => buildings.map(pick);
  const left = Math.min(...extent(([, x]) => x));
  const top = Math.min(...extent(([, , y]) => y));
  const right = Math.max(...buildings.map(([id, x]) => x + combat[id].size));
  const bottom = Math.max(...buildings.map(([id, , y]) => y + combat[id].size));
  // Walls a few levels behind the Town Hall, as a real village of that tier has them. Walls
  // at the catalog ceiling would leave a lone surviving troop chipping for ten minutes.
  // The walls may use the rings the garrison was kept out of.
  ground.inset = MARGIN;
  const wallLevel = level('Wall', Math.max(1, townhall - 3));
  const wanted = 70 + (townhall - 9) * 12;
  let walls = 0;
  for (let d = 1; walls < wanted && d < AREA; d++) {
    const ring = border(left - d, top - d, right + d - 1, bottom + d - 1);
    if (!ring.length) break;
    for (const tile of ring) {
      if (walls >= wanted) break;
      if (!ground.free(tile.x, tile.y, 1, 0)) continue;
      ground.occupy(tile.x, tile.y, 1);
      push(buildings, 'Wall', tile, wallLevel);
      walls++;
    }
  }
  const loot = 120000 + index * 22000;
  return {
    stage: runtime.stages.length + index + 1,
    name: NAMES[index],
    family: 'forged',
    dependencies: [runtime.stages.length + index],
    alwaysUnlocked: false,
    gold: loot,
    elixir: loot,
    darkElixir: townhall >= 10 ? 1500 + index * 350 : 0,
    recommendedTownHall: townhall,
    allianceDefenders: [],
    defendingHeroes: [],
    buildings,
    traps: trapList,
    obstacles: [],
    decos: [],
    infernoStates: [],
    activeModes: [],
    lateStates: [],
  };
}

const count = CAMPAIGN_LENGTH - runtime.stages.length;
if (count > NAMES.length) throw new Error(`Only ${NAMES.length} names for ${count} villages`);
const stages = Array.from({ length: count }, (_, index) => village(index, count));
for (const stage of stages) {
  const placed = [...stage.buildings, ...stage.traps];
  for (const [id, x, y] of placed) {
    const span = combat[id].size;
    if (x < MARGIN || y < MARGIN || x + span > AREA - MARGIN || y + span > AREA - MARGIN)
      throw new Error(`${stage.name}: ${combat[id].name} outside the buildable square`);
  }
  if (placed.length > 500) throw new Error(`${stage.name}: ${placed.length} entities`);
}
const content = JSON.stringify({ stages }, null, 1) + '\n';
if (process.argv.includes('--check')) {
  if (fs.readFileSync(DEST, 'utf8') !== content) throw new Error('Generated villages differ');
  console.log(`Verified ${stages.length} forged villages.`);
} else {
  fs.writeFileSync(DEST, content);
  console.log(
    `Wrote ${stages.length} forged villages, Town Hall ${stages[0].recommendedTownHall}` +
      `–${stages.at(-1).recommendedTownHall}, ` +
      `${stages.reduce((n, s) => n + s.buildings.length + s.traps.length, 0)} entities.`,
  );
}
