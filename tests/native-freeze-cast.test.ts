import {
  BattleSoundLog,
  troopSoundCues,
  spellSoundEffect,
  effectCue,
} from '../src/game/troop-sounds';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
function arena(version = REPLAY_VERSION, level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'builder', 10, 10, 1),
    makeBuilding(3, 'goldstorage', 14, 10, 15),
    makeBuilding(4, 'townhall', 18, 10, 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), freeze: 2 };
  model.state.spellLevels = { ...model.state.spellLevels, freeze: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  model.battle = replayBattle(data.initial, version);
  const run = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) model.step(0.05);
  };
  const cast = (x = 16, y = 11) => {
    model.activeSpell = 'freeze';
    expect(model.castSpell(x, y)).toBe(true);
  };
  return { model, run, cast };
}
it('a captured cast stays current after its one-pulse live record disappears', () => {
  const a = arena();
  a.cast();
  a.run(0.2);
  expect(a.model.battle!.nativeFreezeCasts![0]).toMatchObject({
    id: 1,
    castAt: 0,
    firstHit: 1.5,
    hits: 0,
  });
  a.run(2);
  expect(a.model.battle!.nativeSpells).toEqual([]);
  expect(a.model.battle!.nativeFreezeCasts![0]).toMatchObject({ id: 1, hits: 1, ended: true });
});
it.each([1, 8])(
  'level %s source cast cues reconstruct after a direct seek beyond the pulse',
  (level) => {
    const a = arena(REPLAY_VERSION, level);
    a.cast();
    a.run(2);
    const before = JSON.stringify(a.model.battle),
      cues = troopSoundCues(a.model.battle!, new BattleSoundLog()).filter((c) =>
        c.key.startsWith('spell:1:'),
      );
    expect(cues).toEqual(
      ['preDeploy', 'deploy'].map((event) =>
        effectCue(
          spellSoundEffect('Freeze', level, event as 'preDeploy' | 'deploy')!,
          `spell:1:${event}`,
          event === 'preDeploy' ? 0 : 0.8,
        ),
      ),
    );
    expect(JSON.stringify(a.model.battle)).toBe(before);
  },
);
it('live and retained cast timelines do not duplicate one another', () => {
  const a = arena(),
    log = new BattleSoundLog();
  a.cast();
  a.run(0.2);
  troopSoundCues(a.model.battle!, log);
  a.run(1);
  troopSoundCues(a.model.battle!, log);
  a.run(2);
  const cues = troopSoundCues(a.model.battle!, log).filter((c) => c.key.startsWith('spell:1:'));
  expect(cues).toHaveLength(2);
  expect(new Set(cues.map((c) => c.key)).size).toBe(2);
});
it('casts without eligible buildings still retain their source field and retire after its horizon', () => {
  const a = arena();
  a.cast(2, 2);
  a.run(2);
  expect(a.model.battle!.nativeOvergrowthRoots).toBeUndefined();
  expect(a.model.battle!.nativeFreezeCasts).toHaveLength(1);
  a.run(14.1);
  expect(a.model.battle!.nativeFreezeCasts).toEqual([]);
});
it('version 114 keeps the former live-only cast audio and omits new capture fields', () => {
  const a = arena(114);
  a.cast();
  a.run(2);
  expect(a.model.battle!.nativeFreezeCasts).toBeUndefined();
  expect(a.model.battle!.nativeFreezeCastPresentation).toBeUndefined();
  expect(
    troopSoundCues(a.model.battle!, new BattleSoundLog()).filter((c) =>
      c.key.startsWith('spell:1:'),
    ),
  ).toEqual([]);
});
it('cast capture leaves physical spell behavior and frozen status deadlines unchanged', () => {
  const a = arena(),
    b = arena(114);
  a.cast();
  b.cast();
  a.run(2);
  b.run(2);
  const now = JSON.parse(JSON.stringify(a.model.battle));
  delete now.nativeFreezeCasts;
  delete now.nativeFreezeCastPresentation;
  delete now.nativeSpellArt;
  expect(now).toEqual(JSON.parse(JSON.stringify(b.model.battle)));
});
it('overlapping actual casts retain independent audio keys and the longer freeze deadline', () => {
  const a = arena(REPLAY_VERSION, 8);
  a.cast();
  a.run(1);
  a.cast();
  a.run(3);
  const battle = a.model.battle!,
    casts = battle.nativeFreezeCasts!,
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:'));
  expect(casts.map((c) => [c.id, c.hits, c.ended])).toEqual([
    [1, 1, true],
    [2, 1, true],
  ]);
  expect(cues.map((c) => c.key)).toEqual([
    'spell:1:preDeploy',
    'spell:1:deploy',
    'spell:2:preDeploy',
    'spell:2:deploy',
  ]);
  expect(battle.buildingEffects?.[3]?.frozenUntil).toBe(8.5);
});
