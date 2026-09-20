import { emptyArmy, emptySpells } from '../src/game/army';
import { it, expect } from 'vitest';
import fs from 'node:fs';
import { GameModel, enemyBase, makeBuilding } from '../src/game/model';
import { BUILDINGS, CAMPAIGN, TROOP_KEYS, maxTroopLevel, type TroopKind } from '../src/game/data';
const approaches = [
  [1, 13],
  [5, 1],
  [27, 13],
  [13, 27],
] as const;
const armies = [
  {
    name: 'healer-pekka',
    level: 3,
    townhall: 8,
    laboratory: 6,
    campLevel: 6,
    campCount: 4,
    units: { pekka: 4, healer: 4, wizard: 6, wallbreaker: 2, archer: 16 },
  },
  {
    name: 'dragons',
    level: 3,
    townhall: 8,
    laboratory: 6,
    campLevel: 6,
    campCount: 4,
    units: { dragon: 10 },
  },
  {
    name: 'early-developed',
    level: 1,
    townhall: 5,
    laboratory: 3,
    campLevel: 5,
    campCount: 3,
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
    townhall: 6,
    laboratory: 4,
    campLevel: 5,
    campCount: 3,
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
    name: 'mid-research',
    level: 3,
    townhall: 7,
    laboratory: 5,
    campLevel: 6,
    campCount: 4,
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
  {
    name: 'veteran',
    level: 5,
    townhall: 8,
    laboratory: 6,
    campLevel: 6,
    campCount: 4,
    units: {
      swordsman: 20,
      archer: 20,
      giant: 16,
      wizard: 14,
      balloon: 2,
      goblin: 10,
      wallbreaker: 2,
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
// The 288 full battle simulations take over 20 seconds on GitHub-hosted runners.
// Allow CI headroom for this audit while keeping the normal timeout for other tests.
it('campaign has a viable opening, a progression gate and a reachable final fortress', () => {
  const results = [];
  for (let stage = 0; stage < 12; stage++)
    for (const army of armies)
      for (let side = 0; side < 4; side++) {
        const m = new GameModel();
        m.state.stars.fill(1);
        m.state.army = { ...emptyArmy(), ...army.units };
        // Compare troop compositions without spell assistance.
        m.state.spells = emptySpells();
        m.state.troopLevels = Object.fromEntries(
          TROOP_KEYS.map((k) => [k, Math.min(army.level, maxTroopLevel(k))]),
        ) as Record<TroopKind, number>;
        // Each scenario fits native Town Hall, barracks, laboratory and housing gates.
        m.townhall!.level = army.townhall;
        m.state.buildings.find((b) => b.kind === 'barracks')!.level =
          army.name === 'healer-pekka' || army.name === 'dragons' ? 10 : 7;
        m.state.buildings.push(
          makeBuilding(m.state.nextId++, 'laboratory', 32, 30, army.laboratory),
        );
        m.state.buildings.find((b) => b.kind === 'camp')!.level = army.campLevel;
        for (const [x, y] of [
          [28, 8],
          [28, 16],
          [28, 24],
        ].slice(0, army.campCount - 1))
          m.state.buildings.push(makeBuilding(m.state.nextId++, 'camp', x, y, army.campLevel));
        expect(m.armySize).toBeLessThanOrEqual(m.capacity);
        m.startBattle(stage);
        for (const kind of [
          'pekka',
          'giant',
          'healer',
          'dragon',
          'wallbreaker',
          'balloon',
          'swordsman',
          'archer',
          'wizard',
          'goblin',
        ] as const) {
          m.activeTroop = kind;
          while (m.battle!.remaining[kind] > 0)
            expect(m.deploy(approaches[side][0], approaches[side][1])).toBe(true);
        }
        for (let step = 0; step < 12000 && !m.battle!.finished; step++) m.step(0.05);
        if (!m.battle!.finished)
          fs.writeFileSync(
            'output/playtest/campaign-unfinished.json',
            JSON.stringify({ stage, army, side, battle: m.battle }, null, 2),
          );
        expect(m.battle!.finished, `${stage + 1}/${army.name}/${side}`).toBe(true);
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
  // This 288-battle functional matrix is not a frame-time benchmark.
}, 180_000);

it('the actual starter army can win the opening raid without spells or upgrades', () => {
  const stars = approaches.map((approach) => {
    const m = new GameModel();
    m.startBattle(0);
    for (const kind of ['swordsman', 'archer'] as const) {
      m.activeTroop = kind;
      while (m.battle!.remaining[kind]) expect(m.deploy(approach[0], approach[1])).toBe(true);
    }
    for (let step = 0; step < 12000 && !m.battle!.finished; step++) m.step(0.05);
    expect(m.battle!.finished).toBe(true);
    return m.battle!.stars;
  });
  expect(
    stars.some((n) => n >= 1),
    `Starter raid stars by approach: ${stars}`,
  ).toBe(true);
});
