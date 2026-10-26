import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { spellEndTime } from '../src/game/native-spells';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
function arena(name: 'Rage' | 'Haste', version = REPLAY_VERSION, actor = false) {
  const key = name === 'Rage' ? 'rage' : 'haste',
    model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 38, 38, 18)];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), rage: 2, haste: 2 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  model.battle = replayBattle(data.initial, version);
  if (actor) {
    model.activeTroop = 'giant';
    expect(model.deploy(2, 2)).toBe(true);
  }
  const cast = () => {
    model.activeSpell = key;
    expect(model.castSpell(2, 2)).toBe(true);
  };
  const run = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) model.step(0.05);
  };
  return { model, cast, run };
}
it.each(['Rage', 'Haste'] as const)(
  '%s captures completed casts and bounds history by the last pulse',
  (name) => {
    const a = arena(name);
    a.cast();
    const cast = a.model.battle!.nativeSpells![0],
      end = spellEndTime(cast);
    a.run(end + 0.1);
    expect(a.model.battle!.nativeSpells).toEqual([]);
    expect(a.model.battle!.nativeSpellCastHistory).toHaveLength(1);
    expect(a.model.battle!.nativeSpellCastHistory![0]).toMatchObject({
      name,
      hits: cast.total,
      ended: true,
    });
    a.run(end + 10.1);
    expect(a.model.battle!.nativeSpellCastHistory).toEqual([]);
  },
);
it.each(['Rage', 'Haste'] as const)(
  '%s retains identical physical boosts and movement against version 116',
  (name) => {
    const a = arena(name, REPLAY_VERSION, true),
      b = arena(name, 116, true);
    a.cast();
    b.cast();
    for (const at of [1.45, 1.8, 8, 24]) {
      a.run(at);
      b.run(at);
      const now = JSON.parse(JSON.stringify(a.model.battle)),
        then = JSON.parse(JSON.stringify(b.model.battle));
      delete now.nativeSpellArt;
      delete now.nativeRecallPresentation;
      delete now.nativeRecallEvents;
      delete now.nativeSpellPulsePresentation;
      delete now.nativeSpellEffectTimelines;
      delete then.nativeSpellArt;
      delete now.nativeSpellCastHistory;
      expect(now).toEqual(then);
      if (at === 1.8)
        expect(a.model.battle!.units[0].native?.effects?.boost?.speed).toBeGreaterThan(0);
    }
  },
);
it.each(['Rage', 'Haste'] as const)(
  'version 116 retains its former %s presentation and Jump-only history',
  (name) => {
    const a = arena(name, 116);
    a.cast();
    a.run(2);
    expect(a.model.battle!.nativeSpellArt).toEqual(['Jump']);
    expect(a.model.battle!.nativeSpellCastHistory).toBeUndefined();
  },
);
it.each(['Rage', 'Haste'] as const)(
  '%s live and captured timelines emit each original sound key once',
  (name) => {
    const a = arena(name),
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
  },
);
it('mixed casts retain independent identities and source cue keys', () => {
  const a = arena('Rage');
  a.cast();
  a.run(1);
  a.model.activeSpell = 'haste';
  expect(a.model.castSpell(2, 2)).toBe(true);
  a.run(2);
  expect(a.model.battle!.nativeSpellCastHistory!.map((c) => [c.id, c.name])).toEqual([
    [1, 'Rage'],
    [2, 'Haste'],
  ]);
  const keys = troopSoundCues(a.model.battle!, new BattleSoundLog())
    .filter((c) => c.key.startsWith('spell:'))
    .map((c) => c.key);
  expect(keys).toEqual([
    'spell:1:preDeploy',
    'spell:1:deploy',
    'spell:2:preDeploy',
    'spell:2:deploy',
  ]);
});
