import { expect, it } from 'vitest';
import { buildingHp, TROOP_KEYS } from '../src/game/data';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, validateReplay, type ReplayData } from '../src/game/replay';

it('uses original Drill health across all eleven tiers', () => {
  expect(Array.from({ length: 11 }, (_, i) => buildingHp('darkdrill', i + 1))).toEqual([
    800, 860, 920, 980, 1060, 1160, 1280, 1380, 1480, 1550, 1600,
  ]);
  for (let level = 1; level <= 11; level++)
    expect(makeBuilding(1, 'darkdrill', 10, 10, level).maxHp).toBe(buildingHp('darkdrill', level));
});
it('preserves damage fraction in old village saves and uses source health for new practice battles', () => {
  const m = new GameModel();
  const b = makeBuilding(999, 'darkdrill', 10, 10, 3);
  b.hp = 675;
  b.maxHp = 1350;
  m.state.buildings.push(b);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  expect(restored.state.buildings.find((b) => b.id === 999)).toMatchObject({ hp: 460, maxHp: 920 });
  restored.startBattle(0, true);
  expect(restored.battle!.buildings.find((b) => b.id === 999)).toMatchObject({
    hp: 920,
    maxHp: 920,
  });
});
it('keeps recorded legacy health unchanged in every compatible replay version', () => {
  for (const version of [34, 35, 36, 37, 38, 39]) {
    const data: ReplayData = {
      version,
      initial: {
        index: 0,
        practice: true,
        nextId: 100,
        buildings: [{ ...makeBuilding(1, 'darkdrill', 10, 10, 3), hp: 1350, maxHp: 1350 }],
        army: emptyArmy(),
        spells: emptySpells(),
        spellLevels: {
          heal: 1,
          rage: 1,
          lightning: 1,
          freeze: 1,
          invisibility: 1,
          jump: 1,
          clone: 1,
          recall: 1,
          revive: 1,
        },
        troopLevels: Object.fromEntries(TROOP_KEYS.map((k) => [k, 1])) as ReturnType<
          typeof emptyArmy
        >,
      },
      steps: [],
      actions: [{ type: 'end', step: 0 }],
    };
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, version).buildings[0]).toMatchObject({
      hp: 1350,
      maxHp: 1350,
    });
    const model = new GameModel();
    expect(model.openReplay(data)).toBe(true);
    expect(model.battle!.buildings[0]).toMatchObject({ hp: 1350, maxHp: 1350 });
  }
});
