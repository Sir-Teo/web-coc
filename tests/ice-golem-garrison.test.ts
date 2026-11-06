import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { hurtDefender, stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import {
  garrisonDeathFreeze,
  garrisonDeathSpell,
  garrisonStats,
  garrisonTroopVersion,
} from '../src/game/garrison-kinds';
import { stepNativeSpells } from '../src/game/native-spells';
import { defaultSpellLevels } from '../src/game/army';
import { validateReplay, type ReplayData } from '../src/game/replay';
import { lateSetup } from './fixtures/late-defense-battle';

function fixture() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = [];
  battle.defenders = [];
  battle.units = [];
  return battle;
}
function unit(id: number, x = 10, kind: Unit['kind'] = 'giant'): Unit {
  return {
    id,
    kind,
    x,
    y: 10,
    hp: 5000,
    maxHp: 5000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
}
it('resolves the level-five defensive source row, melee frost and split windup', () => {
  const stats = garrisonStats('icegolem', 5);
  expect(stats).toMatchObject({
    character: 'Defensive Ice Golem',
    animation: 'IceGolem_lvl5',
    hp: 3400,
    damage: 80,
    rate: 2,
    firstAttackDelay: 1.5,
    recovery: 0.5,
    frost: { duration: 2, scale: 0.5 },
    ability: { name: 'IceGolemOnDeathDEF', level: 5 },
  });
  expect(garrisonDeathFreeze(stats)).toEqual({
    name: 'IceGolemFreeze_DEF',
    level: 5,
    duration: 3,
    outerDuration: 2.475,
    radius: 5.5,
  });
  expect(garrisonDeathSpell(stats)).toBeUndefined();
  expect(garrisonDeathFreeze(garrisonStats('electrodragon', 3))).toBeUndefined();
  expect(garrisonDeathSpell(garrisonStats('electrodragon', 3))).toMatchObject({ hits: 6 });
});
it('waits for melee windup and applies source frost to the struck ground attacker', () => {
  const b = fixture();
  const ice = spawnGarrisonDefender(b, 'icegolem', 5, 1, 10, 10, 0);
  b.units = [unit(1), unit(2, 10, 'dragon')];
  for (let i = 1; i <= 29; i++) {
    b.elapsed = i * 0.05;
    stepDefenders(b, 0.05, () => {});
  }
  expect(ice.attacks).toHaveLength(0);
  b.elapsed = 1.5;
  stepDefenders(b, 0.05, () => {});
  expect(ice.attacks).toHaveLength(1);
  expect(b.units.map((u) => u.hp)).toEqual([4920, 5000]);
  expect(b.units[0].late?.garrison?.frost).toMatchObject({ until: 3.5, scale: 0.5 });
  expect(b.units[1].late?.garrison?.frost).toBeUndefined();
});
it('casts once at death and freezes eligible attackers at the native spell pulse', () => {
  const b = fixture();
  const ice = spawnGarrisonDefender(b, 'icegolem', 5, 1, 10, 10, 0);
  const friendly = spawnGarrisonDefender(b, 'golem', 8, 1, 10, 10, 0);
  b.units = [
    unit(1),
    unit(2, 15.5, 'dragon'),
    unit(3, 15.50001),
    { ...unit(4), native: { burrowed: true } },
    { ...unit(5), ejected: true },
    { ...unit(6), hp: 0 },
    { ...unit(7), spawnedAt: 0.91 },
    { ...unit(8, 10, 'swordsman'), hero: 'king' },
  ];
  b.elapsed = 0.2;
  hurtDefender(b, ice, ice.maxHp);
  stepDefenders(b, 0, () => {});
  const cast = b.nativeSpells![0];
  expect(cast).toMatchObject({
    name: 'IceGolemFreeze_DEF',
    level: 5,
    side: 'defense',
    castAt: 0.2,
    total: 1,
  });
  expect(cast.firstHit).toBeCloseTo(0.9, 12);
  expect(ice.bolts).toBeUndefined();
  const pulse = () =>
    stepNativeSpells({
      battle: b,
      damageBuilding: () => {
        throw Error('Defensive freeze damaged a building');
      },
      effect: () => {},
    });
  b.elapsed = 0.899;
  pulse();
  expect(b.units.every((u) => !u.native?.effects?.frozenUntil)).toBe(true);
  b.elapsed = 0.9;
  pulse();
  expect(b.units.map((u) => u.native?.effects?.frozenUntil)).toEqual([
    3.9,
    3.9,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    3.9,
  ]);
  expect(b.units.map((u) => u.hp)).toEqual([5000, 5000, 5000, 5000, 5000, 0, 5000, 5000]);
  expect(friendly.frozenUntil).toBeUndefined();
  for (let i = 0; i < 10; i++) {
    b.elapsed += 0.05;
    stepDefenders(b, 0, () => {});
    pulse();
  }
  expect(b.nativeSpellSequence).toBe(1);
  expect(ice.deathSpellCast).toBe(true);
});
it('admits Ice Golem five only from recording version 235', () => {
  const initial = lateSetup(56, { giant: 1 });
  initial.spellLevels = defaultSpellLevels();
  const castle = initial.buildings.find((b) => b.kind === 'clancastle')!;
  initial.garrisons = [
    { castleId: castle.id, mode: 'guard', troops: [{ kind: 'icegolem', level: 5, count: 2 }] },
  ];
  const data: ReplayData = {
    version: 235,
    initial,
    steps: [],
    actions: [{ type: 'end', step: 0 }],
  };
  expect(garrisonTroopVersion('icegolem', 5)).toBe(235);
  expect(validateReplay(data)).toBe(true);
  expect(validateReplay({ ...data, version: 234 })).toBe(false);
});

it('reconstructs a real lure, melee frost, death-freeze and thaw through portable reverse seeks', async () => {
  const { iceGolemGarrisonRecording } = await import('./fixtures/ice-golem-garrison');
  const { makeReplayFile, parseReplayFile } = await import('../src/game/replay-file');
  const r = iceGolemGarrisonRecording(),
    model = new GameModel();
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const checkpoint of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(checkpoint.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(JSON.parse(JSON.stringify(model.battle))).toEqual(checkpoint.battle);
  }
});
