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
  const a = arena(),
    b = arena(115);
  a.cast();
  b.cast();
  for (const at of [1.45, 1.5, 12, 21.45, 21.5, 24]) {
    a.run(at);
    b.run(at);
    expect([...jumpWalls(a.model.battle!)]).toEqual([...jumpWalls(b.model.battle!)]);
    const now = JSON.parse(JSON.stringify(a.model.battle));
    delete now.nativeSpellArt;
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
