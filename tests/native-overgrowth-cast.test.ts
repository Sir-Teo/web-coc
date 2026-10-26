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
  model.state.spells = { ...emptySpells(), overgrowth: 2 };
  model.state.spellLevels = { ...model.state.spellLevels, overgrowth: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  model.battle = replayBattle(data.initial, version);
  const run = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) model.step(0.05);
  };
  const cast = (x = 16, y = 11) => {
    model.activeSpell = 'overgrowth';
    expect(model.castSpell(x, y)).toBe(true);
  };
  return { model, run, cast };
}
it('a captured cast stays current after its one-pulse live record disappears', () => {
  const a = arena();
  a.cast();
  a.run(0.2);
  expect(a.model.battle!.nativeOvergrowthCasts![0]).toMatchObject({
    id: 1,
    castAt: 0,
    firstHit: 1.5,
    hits: 0,
  });
  a.run(2);
  expect(a.model.battle!.nativeSpells).toEqual([]);
  expect(a.model.battle!.nativeOvergrowthCasts![0]).toMatchObject({ id: 1, hits: 1, ended: true });
});
it.each([1, 5])(
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
      ['preDeploy', 'deploy2'].map((event) =>
        effectCue(
          spellSoundEffect('Overgrowth', level, event as 'preDeploy' | 'deploy2')!,
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
  expect(a.model.battle!.nativeOvergrowthCasts).toHaveLength(1);
  a.run(33.6);
  expect(a.model.battle!.nativeOvergrowthCasts).toEqual([]);
});
it('version 113 keeps the former live-only cast audio and omits new capture fields', () => {
  const a = arena(113);
  a.cast();
  a.run(2);
  expect(a.model.battle!.nativeOvergrowthCasts).toBeUndefined();
  expect(a.model.battle!.nativeOvergrowthCastPresentation).toBeUndefined();
  expect(
    troopSoundCues(a.model.battle!, new BattleSoundLog()).filter((c) =>
      c.key.startsWith('spell:1:'),
    ),
  ).toEqual([]);
});
it('cast capture leaves physical spell behavior and root lifetimes unchanged', () => {
  const a = arena(),
    b = arena(113);
  a.cast();
  b.cast();
  a.run(2);
  b.run(2);
  const now = JSON.parse(JSON.stringify(a.model.battle));
  delete now.nativeOvergrowthCasts;
  delete now.nativeFreezeCastPresentation;
  delete now.nativeSpellArt;
  delete now.nativeSpellPulsePresentation;
  delete now.nativeSpellEffectTimelines;
  delete now.nativeOvergrowthCastPresentation;
  expect(now).toEqual(JSON.parse(JSON.stringify(b.model.battle)));
});
