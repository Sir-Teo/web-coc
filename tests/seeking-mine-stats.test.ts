import { expect, it } from 'vitest';
import native from '../reference/seeking-mine/native.json';
import {
  BUILDINGS,
  buildingHp,
  maxLevelFor,
  trapStats,
  upgradeCost,
  upgradeSeconds,
} from '../src/game/data';
import { SEEKING_MINE, seekingMineStats } from '../src/game/seeking-mine-stats';
import { requiredTownHall } from '../src/game/progression';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { NATIVE_COMBAT, nativeBuildings, nativeCampaignIssues } from '../src/game/native-campaign';
import { stepTraps } from '../src/game/traps';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

// Independently inherit original sparse CSV rows, without reading the runtime projection.
let inherited: Record<string, string> = {};
const original = native.trap.map((row) => (inherited = { ...inherited, ...row }));
for (const [index, row] of original.entries())
  it(`preserves original mine level ${index + 1} damage, progression and single-target impact`, () => {
    const level = index + 1;
    expect(trapStats('seekingairmine', level)?.damage).toBe(Number(row.Damage));
    expect(requiredTownHall('seekingairmine', level)).toBe(
      level === 1 ? 7 : Number(row.TownHallLevel),
    );
    expect(buildingHp('seekingairmine', level)).toBe(NATIVE_COMBAT[12000006].hp[index]);
    expect(seekingMineStats(level)).toMatchObject({
      setup: row.ExportName,
      projectile: row.Projectile,
    });
    if (level > 1) {
      expect(upgradeCost('seekingairmine', level - 1)).toBe(Number(row.BuildCost));
      expect(upgradeSeconds('seekingairmine', level - 1)).toBe(
        Number(row.BuildTimeD) * 86400 +
          Number(row.BuildTimeH) * 3600 +
          Number(row.BuildTimeM) * 60,
      );
    }
    const m = new GameModel();
    m.startBattle(0, true);
    const b = m.battle!;
    b.buildings = [makeBuilding(9000, 'seekingairmine', 10, 10, level)];
    const target: Unit = {
      id: 10000,
      kind: 'dragon',
      x: 14,
      y: 10.5,
      hp: 5000,
      maxHp: 5000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    };
    const neighbor = { ...target, id: 10001, x: 14.1 };
    b.units = [target, neighbor];
    stepTraps(b, 0, () => {});
    // Action frame 7 of the original 24 fps timeline: remain stationary right up to release.
    b.elapsed = 7 / 24;
    stepTraps(b, b.elapsed, () => {});
    expect(b.traps[9000].x).toBe(10.5);
    b.elapsed += 0.5;
    stepTraps(b, 0.5, () => {});
    expect(b.traps[9000].x).toBe(12.25);
    expect(target.hp).toBe(5000);
    b.elapsed += 0.5;
    stepTraps(b, 0.5, () => {});
    expect(target.hp).toBe(5000 - Number(row.Damage));
    expect(neighbor.hp).toBe(5000);
    b.elapsed += 2;
    stepTraps(b, 2, () => {});
    expect(target.hp).toBe(5000 - Number(row.Damage));
  });

it('retains all eight levels through save and practice while enforcing the TH8 home ceiling', () => {
  expect(BUILDINGS.seekingairmine.maxLevel).toBe(8);
  expect(Array.from({ length: 8 }, (_, i) => maxLevelFor('seekingairmine', i + 1))).toEqual([
    0, 0, 0, 0, 0, 0, 1, 1,
  ]);
  expect(SEEKING_MINE).toEqual({ speed: 3.5, minHousing: 5, trigger: 4, radius: 0, delay: 7 / 24 });
  for (let level = 1; level <= 8; level++) {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(2, 'seekingairmine', 10, 10, level),
      makeBuilding(3, 'builder', 26, 26),
    ];
    m.state.nextId = 4;
    expect(validateSave(m.state)).toBe(true);
    const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
    const mine = restored.state.buildings[1];
    expect(mine).toMatchObject({ level, hp: 1, maxHp: 1 });
    restored.state.gold = 30000000;
    restored.upgrade(2);
    expect(mine.upgradeEnd).toBeUndefined();
    expect(restored.state.gold).toBe(30000000);
    restored.startBattle(0, true);
    expect(restored.battle!.buildings[1]).toMatchObject({ level, hp: 1 });
    restored.deploy(1, 1);
    restored.step(0.05);
    restored.finishBattle();
    const replay = restored.state.raidLog[0].replay!;
    const exported = parseReplayFile(JSON.stringify(makeReplayFile(replay)));
    expect(exported.version).toBe(40);
    expect(exported.initial.buildings[1]).toMatchObject({ level, hp: 1 });
  }
});

it('preserves all 59 level-three mines across the three newly supported original layouts', () => {
  let count = 0;
  for (const index of [51, 52, 53]) {
    expect(nativeCampaignIssues(index)).toEqual([]);
    const mines = nativeBuildings(index).filter((b) => b.kind === 'seekingairmine');
    expect(mines).toHaveLength([8, 19, 32][index - 51]);
    for (const mine of mines) {
      expect(mine).toMatchObject({ level: 3, hp: 1, maxHp: 1 });
      expect(trapStats(mine.kind, mine.level)?.damage).toBe(2100);
    }
    count += mines.length;
  }
  expect(count).toBe(59);
});

it('keeps v32 results readable while refusing playback under the changed release timing', () => {
  expect(REPLAY_VERSION).toBe(40);
  const m = new GameModel();
  m.startBattle(0, true);
  m.deploy(1, 1);
  m.step(0.05);
  m.finishBattle();
  m.returnHome();
  const record = m.state.raidLog[0];
  record.replay!.version = 32;
  expect(validateReplay(record.replay)).toBe(true);
  expect(validateSave(m.state)).toBe(true);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(restored.state.raidLog[0].result).toEqual(record.result);
  expect(restored.startReplay(record.id)).toBe(false);
  expect(restored.battle).toBeNull();
});
