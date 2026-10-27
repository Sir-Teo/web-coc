import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { nativeFieldSpellRecording } from './fixtures/native-field-spells';
import { nativeHealingSpellRecording } from './fixtures/native-healing-spell';
import { attackerHitPoisonRecording } from './fixtures/attacker-hit-poison';
import { defenderPoisonRecording } from './fixtures/defender-poison';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
for (const name of ['Healing', 'Poison'] as const) {
  it(`${name} retains completed field history after its live pulses end`, () => {
    const r = nativeFieldSpellRecording(name),
      battle = r.snapshots.find((s) => s.at === r.afterLive)!.battle as Battle;
    expect(battle.nativeSpells).toEqual([]);
    expect(battle.nativeSpellCastHistory).toHaveLength(1);
    expect(battle.nativeSpellCastHistory![0]).toMatchObject({ name, ended: true });
  });
  it(`${name} portable history reconstructs through forward and reverse seeks`, () => {
    const r = nativeFieldSpellRecording(name, 12),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(model.battle).toEqual(snapshot.battle);
    }
  });
}
function comparePhysical(
  data: ReturnType<typeof nativeHealingSpellRecording>['data'],
  snapshots: { at: number; battle: unknown }[],
) {
  const model = new GameModel(),
    old = structuredClone(data);
  old.version = 117;
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(old))))).toBe(true);
  for (const snapshot of snapshots) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    const now = JSON.parse(JSON.stringify(snapshot.battle)) as Battle,
      then = JSON.parse(JSON.stringify(model.battle)) as Battle;
    delete now.nativeSpellArt;
    delete now.nativeRecallPresentation;
    delete now.nativeReviveTargets;
    delete now.nativeRecallEvents;
    delete now.nativeSpellPulsePresentation;
    delete now.nativeSpellEffectTimelines;
    delete then.nativeSpellArt;
    delete now.nativeSpellCastHistory;
    expect(now).toEqual(then);
  }
}
it.each([1, 12])(
  'level %s Healing restores actual Cannon wounds without changing version-117 physics',
  (level) => {
    const r = nativeHealingSpellRecording(level),
      healed = r.snapshots.find((s) => s.at === r.healed)!.battle as Battle;
    expect(healed.units.find((u) => u.id === r.unitId)!.hp).toBeGreaterThan(r.beforeHp);
    expect(healed.nativeSpellCastHistory?.some((c) => c.name === 'Healing')).toBe(true);
    comparePhysical(r.data, r.snapshots);
  },
);
it('actual garrison Poison damage and avoidance retain version-117 physical states', () => {
  // Compare the version-118 presentation change before later garrison protection rules.
  const r = defenderPoisonRecording(1, 0.05, 118),
    poisoned = r.snapshots.find((s) => s.at === r.poisoned)!.battle as Battle,
    defender = poisoned.defenders!.find((d) => d.id === r.defenderId)!;
  expect(defender.poison).toBeDefined();
  expect(defender.hp).toBeLessThan(defender.maxHp);
  expect(poisoned.nativeSpellCastHistory?.some((c) => c.name === 'Poison')).toBe(true);
  comparePhysical(r.data, r.snapshots);
});
it('captured Healing emits each original pulse sound key once', () => {
  const r = nativeFieldSpellRecording('Healing'),
    battle = r.snapshots.find((s) => s.at === r.pulsing)!.battle as Battle,
    cues = troopSoundCues(battle, new BattleSoundLog()).filter((c) => c.key.startsWith('spell:1:'));
  expect(cues.map((c) => c.key)).toEqual([
    'spell:1:preDeploy',
    'spell:1:deploy',
    'spell:1:hit:0',
    'spell:1:hit:1',
  ]);
});

it('Headhunter on-hit poison stays a status instead of spawning ordinary spell fields', () => {
  const r = attackerHitPoisonRecording('headhunter');
  for (const snapshot of r.snapshots) {
    const battle = snapshot.battle as Battle;
    expect(battle.nativeSpellCastHistory?.some((c) => c.name === 'Poison') ?? false).toBe(false);
  }
});
