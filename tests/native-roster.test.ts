import { describe, expect, it } from 'vitest';
import { TROOP_KEYS, maxTroopLevel, type BuildingKind, type TroopKind } from '../src/game/data';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeUnitStats } from '../src/game/native-units';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { EXTRA_TROOP_KINDS } from '../src/game/extra-troops';

type Placement = [BuildingKind, number, number, number?];
function arena(layout: Placement[], army: Partial<Record<TroopKind, number>>, level?: number) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    // Town Hall 11 has no weapon or Guardian, so only the placed buildings defend.
    makeBuilding(1, 'townhall', 22, 22, 11),
    ...layout.map(([kind, x, y, lvl], i) => makeBuilding(10 + i, kind, x, y, lvl ?? 1)),
  ];
  m.state.nextId = 5000;
  m.state.army = { ...emptyArmy(), ...army };
  m.state.spells = emptySpells();
  m.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, level ?? maxTroopLevel(k)]),
  ) as Record<TroopKind, number>;
  m.startBattle(0, true);
  return m;
}
const run = (m: GameModel, seconds: number, step = 0.05) => {
  for (let t = 0; t < seconds && !m.battle!.finished; t += step) m.step(step);
};
const building = (m: GameModel, id: number) => m.battle!.buildings.find((b) => b.id === id)!;

describe('version 45 native roster battles', () => {
  it('deploys every roster troop at its maximum level without stalling the simulation', () => {
    const layout: Placement[] = [
      ['cannon', 10, 10, 10],
      ['archertower', 16, 10, 10],
      ['airdefense', 10, 16, 8],
      ['goldstorage', 30, 30, 10],
      ['wizardtower', 34, 12, 8],
    ];
    for (const kind of EXTRA_TROOP_KINDS) {
      const m = arena(layout, { [kind]: 3 });
      m.activeTroop = kind;
      expect(m.deploy(3, 3), kind).toBe(true);
      expect(m.deploy(4, 3), kind).toBe(true);
      expect(m.deploy(3, 4), kind).toBe(true);
      expect(m.battle!.nativeRoster).toBe(true);
      run(m, 40);
      const b = m.battle!;
      expect(Number.isFinite(b.elapsed)).toBe(true);
      for (const u of b.units) {
        expect(Number.isFinite(u.x) && Number.isFinite(u.y), `${kind} position`).toBe(true);
        expect(Number.isFinite(u.hp), `${kind} hp`).toBe(true);
      }
    }
  });

  it('splits a defeated Golem into its level’s Golemites and resolves death damage', () => {
    const m = arena([['cannon', 12, 12, 1]], { golem: 1 });
    m.activeTroop = 'golem';
    expect(m.deploy(9, 13)).toBe(true);
    const golem = m.battle!.units[0];
    const stats = nativeUnitStats('golem', maxTroopLevel('golem'));
    golem.x = 11.6;
    golem.hp = 1;
    m.step(0.05);
    golem.hp = 0;
    m.step(0.05);
    const golemites = m.battle!.units.filter((u) => u.kind === 'golemite');
    expect(golemites).toHaveLength(stats.secondaryCount);
    expect(golemites.every((u) => u.level === stats.level)).toBe(true);
    const cannon = building(m, 10);
    run(m, 0.2);
    expect(cannon.hp).toBeLessThan(cannon.maxHp);
  });

  it('sends Lava Hounds to Air Defenses first and releases pups on death', () => {
    const m = arena(
      [
        ['cannon', 6, 6, 1],
        ['airdefense', 30, 30, 1],
      ],
      { lavahound: 1 },
    );
    m.activeTroop = 'lavahound';
    m.deploy(5, 3);
    run(m, 0.2);
    const hound = m.battle!.units[0];
    expect(hound.target).toBe(11);
    hound.hp = 0;
    m.step(0.05);
    const stats = nativeUnitStats('lavahound', maxTroopLevel('lavahound'));
    expect(m.battle!.units.filter((u) => u.kind === 'lavapup')).toHaveLength(stats.secondaryCount);
  });

  it('summons Witch skeletons on the native cooldown and respects the alive limit', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { witch: 1 });
    m.activeTroop = 'witch';
    m.deploy(3, 3);
    const stats = nativeUnitStats('witch', maxTroopLevel('witch'));
    run(m, stats.summonCooldown * 4);
    const skeletons = m.battle!.units.filter((u) => u.kind === 'skeleton' && u.hp > 0);
    expect(skeletons.length).toBeGreaterThan(0);
    expect(skeletons.length).toBeLessThanOrEqual(stats.summonLimit);
    expect(skeletons.every((u) => u.native?.owner === m.battle!.units[0].id)).toBe(true);
  });

  it('keeps burrowed Miners out of defensive targeting until they attack', () => {
    const m = arena([['cannon', 20, 20, 5]], { miner: 1 });
    m.activeTroop = 'miner';
    m.deploy(20, 13);
    run(m, 0.5);
    const miner = m.battle!.units[0];
    expect(miner.native?.burrowed).toBe(true);
    expect(m.battle!.defenseTargets[10]).toBeUndefined();
    run(m, 10);
    expect(miner.native?.burrowed).toBe(false);
  });

  it('chains Electro Dragon lightning across neighboring buildings', () => {
    const m = arena(
      [
        ['goldstorage', 10, 10, 1],
        ['elixirstorage', 13, 10, 1],
        ['goldmine', 16, 10, 1],
      ],
      { electrodragon: 1 },
    );
    m.activeTroop = 'electrodragon';
    m.deploy(8, 7);
    run(m, 6);
    const damaged = [10, 11, 12].filter((id) => building(m, id).hp < building(m, id).maxHp);
    expect(damaged.length).toBeGreaterThanOrEqual(2);
  });

  it('damages every building around a spinning Valkyrie', () => {
    const m = arena(
      [
        ['goldmine', 10, 10, 1],
        ['collector', 10, 13, 1],
      ],
      { valkyrie: 1 },
    );
    m.activeTroop = 'valkyrie';
    expect(m.deploy(18, 13)).toBe(true);
    const valkyrie = m.battle!.units[0];
    valkyrie.x = 13.2;
    valkyrie.y = 12.9;
    run(m, 4);
    expect(building(m, 10).hp).toBeLessThan(building(m, 10).maxHp);
    expect(building(m, 11).hp).toBeLessThan(building(m, 11).maxHp);
  });

  it('releases Yetimites as a Yeti takes damage and the remainder on death', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { yeti: 1 });
    m.activeTroop = 'yeti';
    m.deploy(3, 3);
    const yeti = m.battle!.units[0];
    m.step(0.05);
    yeti.native!.damageTaken = 2000;
    m.step(0.05);
    const early = m.battle!.units.filter((u) => u.kind === 'yetimite').length;
    expect(early).toBeGreaterThan(0);
    yeti.hp = 0;
    m.step(0.05);
    expect(m.battle!.units.filter((u) => u.kind === 'yetimite').length).toBeGreaterThan(early);
  });

  it('splits a Meteor Golem into two half-health Meteormites when it throws', () => {
    const m = arena([['goldstorage', 12, 12, 1]], { meteorgolem: 1 });
    m.activeTroop = 'meteorgolem';
    expect(m.deploy(4, 13)).toBe(true);
    const golem = m.battle!.units[0];
    const level = maxTroopLevel('meteorgolem');
    const mite = nativeUnitStats('meteormite', level);
    for (let i = 0; i < 400 && golem.kind === 'meteorgolem'; i++) m.step(0.05);
    expect(golem.kind).toBe('meteormite');
    const step = mite.hp / 100;
    expect(golem.hp % step).toBeCloseTo(0, 6);
    run(m, 2);
    const mites = m.battle!.units.filter((u) => u.kind === 'meteormite' && u.hp > 0);
    expect(mites).toHaveLength(2);
  });

  it('merges two idle Meteormites back into a briefly invulnerable Meteor Golem', () => {
    const m = arena([['goldstorage', 40, 40, 1]], { swordsman: 1 });
    m.activeTroop = 'swordsman';
    m.deploy(2, 2);
    const b = m.battle!;
    const level = 3;
    const mite = nativeUnitStats('meteormite', level);
    for (const [id, x] of [
      [9001, 10],
      [9002, 12],
    ] as const)
      b.units.push({
        id,
        kind: 'meteormite',
        level,
        x,
        y: 10,
        hp: mite.hp / 2,
        maxHp: mite.hp,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        native: {},
      });
    run(m, 3);
    const golem = b.units.find((u) => u.kind === 'meteorgolem' && u.hp > 0);
    expect(golem).toBeDefined();
    expect(b.units.filter((u) => u.kind === 'meteormite' && u.hp > 0)).toHaveLength(0);
  });

  it('keeps the Furnace passive while it drains and releases Firemites on schedule', () => {
    const m = arena([['goldstorage', 30, 30, 1]], { furnace: 1 });
    // Indestructible targets keep the battle open for the Furnace's whole lifetime.
    for (const b of m.battle!.buildings) b.hp = b.maxHp = 1e9;
    m.activeTroop = 'furnace';
    m.deploy(6, 6);
    const furnace = m.battle!.units[0];
    const stats = nativeUnitStats('furnace', maxTroopLevel('furnace'));
    run(m, stats.bunkerDecay / 2);
    expect(furnace.hp).toBeCloseTo(furnace.maxHp / 2, 0);
    expect(furnace.attacking).toBe(false);
    run(m, stats.bunkerDecay / 2 - 1);
    expect(m.battle!.units.filter((u) => u.kind === 'firemite')).toHaveLength(stats.bunkerCount);
    expect(furnace.hp / furnace.maxHp).toBeLessThan(0.1);
  });

  it('turns rubble into a Ruin Knight after the vacuum and wind-up', () => {
    const m = arena([['goldmine', 10, 10, 1]], { ruinwitch: 1, swordsman: 1 });
    m.activeTroop = 'ruinwitch';
    m.deploy(6, 11);
    const mine = building(m, 10);
    run(m, 2);
    expect(m.battle!.units[0].x).toBe(6);
    m.damage(mine, mine.maxHp);
    const stats = nativeUnitStats('ruinwitch', maxTroopLevel('ruinwitch'));
    const vacuum = 4;
    run(m, 4 + vacuum + stats.summonDelay + 0.5);
    expect(m.battle!.units.some((u) => u.kind === 'ruinknight')).toBe(true);
    expect(m.battle!.consumedRubble).toContain(10);
  });

  it('keeps a lone Druid’s battle open until its Bear form fights', () => {
    const m = arena([['goldstorage', 20, 20, 1]], { druid: 1 });
    m.activeTroop = 'druid';
    m.deploy(3, 3);
    run(m, 5);
    expect(m.battle!.finished).toBe(false);
    run(m, 30);
    expect(m.battle!.units[0].kind).toBe('bear');
  });

  it('sends a Lava Hound to other defenses once Air Defenses are gone', () => {
    const m = arena(
      [
        ['goldmine', 6, 6, 1],
        ['cannon', 30, 30, 1],
      ],
      { lavahound: 1 },
    );
    m.activeTroop = 'lavahound';
    m.deploy(5, 3);
    run(m, 0.2);
    expect(m.battle!.units[0].target).toBe(11);
  });

  it('replays native abilities to the identical final battle', () => {
    const m = arena(
      [
        ['cannon', 12, 12, 8],
        ['airdefense', 20, 12, 6],
        ['goldstorage', 16, 18, 8],
      ],
      { golem: 1, witch: 2, lavahound: 1, electrodragon: 1, yeti: 1 },
    );
    for (const [kind, x, y] of [
      ['golem', 3, 12],
      ['witch', 3, 14],
      ['witch', 3, 15],
      ['lavahound', 30, 3],
      ['electrodragon', 3, 3],
      ['yeti', 40, 40],
    ] as const) {
      m.activeTroop = kind;
      expect(m.deploy(x, y)).toBe(true);
    }
    run(m, 90, 0.05);
    m.finishBattle();
    const record = m.state.raidLog![0];
    const parsed = parseReplayFile(JSON.stringify(makeReplayFile(record.replay!)));
    expect(parsed.version).toBe(45);
    const viewer = new GameModel();
    expect(viewer.openReplay(parsed)).toBe(true);
    viewer.seekReplay(1e9);
    for (let i = 0; i < 200 && viewer.replay?.seeking; i++) viewer.step(0.016);
    const live = m.battle!;
    const replayed = viewer.battle!;
    expect(replayed.destruction).toBe(live.destruction);
    expect(replayed.units.length).toBe(live.units.length);
    expect(replayed.buildings.map((b: Building) => Math.round(b.hp))).toEqual(
      live.buildings.map((b: Building) => Math.round(b.hp)),
    );
  });
});
