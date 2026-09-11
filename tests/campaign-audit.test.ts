import { it, expect } from 'vitest';
import fs from 'node:fs';
import { GameModel, enemyBase, makeBuilding } from '../src/game/model';
import { BUILDINGS, CAMPAIGN, TROOP_KEYS, type TroopKind } from '../src/game/data';
const approaches = [
  [1, 13],
  [5, 1],
  [27, 13],
  [13, 27],
] as const;
const armies = [
  {
    name: 'early-developed',
    level: 1,
    units: {
      swordsman: 14,
      archer: 12,
      giant: 3,
      wizard: 3,
      balloon: 0,
      goblin: 0,
      wallbreaker: 0,
    },
  },
  {
    name: 'developed',
    level: 2,
    units: {
      swordsman: 18,
      archer: 18,
      giant: 8,
      wizard: 6,
      balloon: 0,
      goblin: 0,
      wallbreaker: 0,
    },
  },
  {
    name: 'veteran',
    level: 3,
    units: {
      swordsman: 20,
      archer: 20,
      giant: 16,
      wizard: 10,
      balloon: 0,
      goblin: 0,
      wallbreaker: 0,
    },
  },
];
it('all twelve authored layouts are distinct, in bounds and have no overlapping footprints', () => {
  const signatures = new Set<string>();
  for (let stage = 0; stage < 12; stage++) {
    const buildings = enemyBase(stage),
      occupied = new Set<string>();
    signatures.add(JSON.stringify(buildings.map((b) => [b.kind, b.x, b.y])));
    for (const b of buildings)
      for (let x = b.x; x < b.x + BUILDINGS[b.kind].size; x++)
        for (let y = b.y; y < b.y + BUILDINGS[b.kind].size; y++) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(28);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(28);
          expect(
            occupied.has(`${x},${y}`),
            `${CAMPAIGN[stage].name}: ${b.kind} overlaps at ${x},${y}`,
          ).toBe(false);
          occupied.add(`${x},${y}`);
        }
  }
  expect(signatures.size).toBe(12);
});
// The 144 full battle simulations take over 20 seconds on GitHub-hosted runners.
// Allow CI headroom for this audit while keeping the normal timeout for other tests.
it('campaign has a viable opening, a progression gate and a reachable final fortress', () => {
  const results = [];
  for (let stage = 0; stage < 12; stage++)
    for (const army of armies)
      for (let side = 0; side < 4; side++) {
        const m = new GameModel();
        m.state.stars.fill(1);
        m.state.army = { ...army.units };
        // These scenarios measure ground armies, so no spells are carried in.
        m.state.spells = { rage: 0, heal: 0, lightning: 0 };
        m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, army.level])) as Record<
          TroopKind,
          number
        >;
        // Army research level and camp housing have separate progression.
        m.townhall!.level = army.name === 'early-developed' ? 4 : 7;
        const campLevel = army.name === 'early-developed' ? 4 : 6;
        m.state.buildings.find((b) => b.kind === 'camp')!.level = campLevel;
        const campSites =
          army.name === 'early-developed'
            ? [[28, 8]]
            : [
                [28, 8],
                [28, 16],
                [28, 24],
              ];
        for (const [x, y] of campSites)
          m.state.buildings.push(makeBuilding(m.state.nextId++, 'camp', x, y, campLevel));
        expect(m.armySize).toBeLessThanOrEqual(m.capacity);
        m.startBattle(stage);
        for (const kind of ['giant', 'swordsman', 'archer', 'wizard'] as const) {
          m.activeTroop = kind;
          while (m.battle!.remaining[kind] > 0) expect(m.deploy(...approaches[side])).toBe(true);
        }
        for (let step = 0; step < 3600 && !m.battle!.finished; step++) m.step(0.05);
        expect(m.battle!.finished).toBe(true);
        results.push({
          stage: stage + 1,
          name: CAMPAIGN[stage].name,
          army: army.name,
          side,
          destruction: m.battle!.destruction,
          stars: m.battle!.stars,
          duration: Math.round(m.battle!.elapsed),
        });
      }
  fs.mkdirSync('output/playtest', { recursive: true });
  fs.writeFileSync('output/playtest/campaign-balance.json', JSON.stringify(results, null, 2));
  expect(
    results.filter((r) => r.stage === 1 && r.army === 'early-developed').every((r) => r.stars >= 1),
  ).toBe(true);
  expect(
    results.filter((r) => r.stage === 12 && r.army === 'early-developed').every((r) => r.stars < 3),
  ).toBe(true);
  for (let stage = 1; stage <= 12; stage++)
    expect(
      results.some((r) => r.stage === stage && r.army === 'veteran' && r.stars === 3),
      `Stage ${stage} cannot be cleared`,
    ).toBe(true);
}, 60_000);

it('the actual starter army can win the opening raid without spells or upgrades', () => {
  const stars = approaches.map((approach) => {
    const m = new GameModel();
    m.startBattle(0);
    for (const kind of ['swordsman', 'archer'] as const) {
      m.activeTroop = kind;
      while (m.battle!.remaining[kind]) expect(m.deploy(...approach)).toBe(true);
    }
    for (let step = 0; step < 3600 && !m.battle!.finished; step++) m.step(0.05);
    expect(m.battle!.finished).toBe(true);
    return m.battle!.stars;
  });
  expect(
    stars.some((n) => n >= 1),
    `Starter raid stars by approach: ${stars}`,
  ).toBe(true);
});
