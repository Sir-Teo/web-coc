import { nativeDirectBattle } from './fixtures/native-direct-attacks';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { jumpWalls } from '../src/game/native-spells';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
function arena(version = REPLAY_VERSION, level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'wall', 10, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), jump: 2 };
  model.state.spellLevels = { ...model.state.spellLevels, jump: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  model.battle = replayBattle(data.initial, version);
  const run = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) model.step(0.05);
  };
  const cast = () => {
    model.activeSpell = 'jump';
    expect(model.castSpell(10.5, 10.5)).toBe(true);
  };
  return { model, run, cast };
}
it.each([1, 5])(
  'level %s retains a completed live Jump through its final source particles, then retires it',
  (level) => {
    const a = arena(REPLAY_VERSION, level),
      duration = 20 * level;
    a.cast();
    a.run(duration + 1.7);
    expect(a.model.battle!.nativeSpells).toEqual([]);
    expect(a.model.battle!.nativeSpellCastHistory).toHaveLength(1);
    expect(a.model.battle!.nativeSpellCastHistory![0]).toMatchObject({
      name: 'Jump',
      hits: duration * 4 + 1,
      ended: true,
    });
    a.run(duration + 11.6);
    expect(a.model.battle!.nativeSpellCastHistory).toEqual([]);
  },
);
it('casts and wall crossing retain the previous physical pulse and expiry deadlines', () => {
  const a = arena(116),
    b = arena(115);
  a.cast();
  b.cast();
  for (const at of [1.45, 1.5, 12, 21.45, 21.5, 24]) {
    a.run(at);
    b.run(at);
    expect([...jumpWalls(a.model.battle!)]).toEqual([...jumpWalls(b.model.battle!)]);
    const now = JSON.parse(JSON.stringify(a.model.battle));
    delete now.nativeSpellArt;
    delete now.nativeRecallPresentation;
    delete now.nativeReviveTargets;
    delete now.nativeRecallEvents;
    delete now.nativeSpellPulsePresentation;
    delete now.nativeSpellEffectTimelines;
    delete now.nativeSpellCastHistory;
    expect(now).toEqual(JSON.parse(JSON.stringify(b.model.battle)));
  }
});
it('live and captured Jump timelines produce one original cast cue per phase', () => {
  const a = arena(),
    log = new BattleSoundLog();
  a.cast();
  a.run(0.4);
  troopSoundCues(a.model.battle!, log);
  a.run(1.8);
  const cues = troopSoundCues(a.model.battle!, log).filter((c) => c.key.startsWith('spell:1:'));
  expect(cues.map((c) => [c.key, c.at])).toEqual([
    ['spell:1:preDeploy', 0],
    ['spell:1:deploy', 0.8],
  ]);
});
it('version 115 omits the new capability list and captured history', () => {
  const a = arena(115);
  a.cast();
  a.run(22);
  expect(a.model.battle!.nativeSpellArt).toBeUndefined();
  expect(a.model.battle!.nativeSpellCastHistory).toBeUndefined();
});
it('overlapping casts keep independent source timelines after live expiry', () => {
  const a = arena();
  a.cast();
  a.run(1);
  const secondAt = a.model.battle!.elapsed;
  a.cast();
  a.run(24);
  expect(a.model.battle!.nativeSpellCastHistory!.map((c) => [c.id, c.castAt, c.ended])).toEqual([
    [1, 0, true],
    [2, secondAt, true],
  ]);
});

it('keeps an active Jump passage closed to a Wall Wrecker', () => {
  const r = unitAtJump('wallwrecker', REPLAY_VERSION, true);
  const control = unitAtJump('wallwrecker', REPLAY_VERSION, false);
  r.until(5);
  control.until(5);
  expect(r.battle.buildings.map(({ hp }) => hp)).toEqual(
    control.battle.buildings.map(({ hp }) => hp),
  );
  expect(r.battle.buildings[8].hp).toBeLessThan(r.battle.buildings[8].maxHp);
  expect(r.unit.x).toBe(control.unit.x);
  expect(r.unit.x).toBeLessThan(11);
});

it('keeps the 261 Wrecker traversal and lets ordinary ground troops use Jump in new recordings', () => {
  const legacy = unitAtJump('wallwrecker', 261, true);
  const walker = unitAtJump('swordsman', REPLAY_VERSION, true);
  legacy.until(7);
  walker.until(7);
  expect(legacy.unit.x).toBeGreaterThan(12);
  expect(walker.unit.x).toBeGreaterThan(12);
  expect(legacy.battle.buildings[8].hp).toBe(legacy.battle.buildings[8].maxHp);
  expect(walker.battle.buildings[8].hp).toBe(walker.battle.buildings[8].maxHp);
});

function unitAtJump(kind: 'wallwrecker' | 'swordsman', version: number, jump: boolean) {
  return nativeDirectBattle(kind, 1, version, 8, 'storage', { jump: 1 }, {
    layout: [
      makeBuilding(1, 'townhall', 15, 10, 12),
      makeBuilding(2, 'goldstorage', 36, 36, 18),
      ...Array.from({ length: 11 }, (_, n) => makeBuilding(3 + n, 'wall', 11, 6 + n, 12)),
    ],
    beforeDeploy({ model, battle, step }) {
      model.activeSpell = 'jump';
      if (!jump) {
        // Both simulations start combat at the same time, with the control field off the route.
        expect(model.castSpell(30, 30)).toBe(true);
      } else {
        expect(model.castSpell(11.5, 11.5)).toBe(true);
      }
      while (battle.elapsed < 1.55) step();
    },
  });
}
