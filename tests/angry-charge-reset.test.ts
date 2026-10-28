import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeTargetingSpellRecording } from './fixtures/native-targeting-spells';
import { troopSoundCues, BattleSoundLog } from '../src/game/troop-sounds';

const kinds = ['archer', 'dragon', 'minion', 'babydragon', 'bowler', 'electrodragon'] as const;
const at = (r: ReturnType<typeof nativeTargetingSpellRecording>, time: number) =>
  r.snapshots.find((s) => s.at === time)!.battle as Battle;
function portable(r: ReturnType<typeof nativeTargetingSpellRecording>) {
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    viewer.seekReplay(s.at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(s.battle);
  }
  return viewer;
}
for (const kind of kinds)
  for (const level of [1, 4])
    for (const version of [196, 197])
      it(`actual Angry Spell ${level} redirects ${kind} and reconstructs version ${version}`, () => {
        const r = nativeTargetingSpellRecording('AngrySpell', level, version, kind),
          pending = at(r, r.pending),
          after = at(r, r.impact),
          u = pending.units.find((u) => u.id === r.unitId)!,
          changed = after.units.find((u) => u.id === r.unitId)!,
          phase = kind === 'bowler' ? u.native!.bowler : u.native!.attackWindup;
        expect(u.target).toBe(2);
        if (kind === 'electrodragon')
          expect(u.native!.electroDragon!.charge!.target).toEqual({ id: 2, building: true });
        else expect(phase).toMatchObject({ engaged: true, target: { id: 2, building: true } });
        expect(changed.native!.angryUntil).toBeGreaterThan(after.elapsed);
        if (version >= 197) {
          expect(changed.target).toBe(3);
          if (kind === 'electrodragon') {
            expect(changed.native!.electroDragon!.charge).toBeUndefined();
            expect(changed.native!.electroDragon!.animAt).toBeUndefined();
            expect(changed.native!.electroDragon!.clock).toBeCloseTo(
              u.native!.electroDragon!.clock + after.elapsed - pending.elapsed,
              8,
            );
            expect(changed.native!.electroDragon!.audioClock).toBeCloseTo(
              u.native!.electroDragon!.audioClock + after.elapsed - pending.elapsed,
              8,
            );
            expect(changed.native!.electroDragon!.recoveryUntil).toBe(
              u.native!.electroDragon!.recoveryUntil,
            );
            expect(changed.native!.electroDragon!.sequence).toBe(u.native!.electroDragon!.sequence);
          } else {
            const reset = kind === 'bowler' ? changed.native!.bowler : changed.native!.attackWindup;
            expect(reset!.engaged).toBeUndefined();
            expect(reset!.target).toBeUndefined();
            expect(reset!.animationOffset).toBeUndefined();
          }
        } else {
          expect(changed.target).toBeNull();
          if (kind === 'electrodragon')
            expect(changed.native!.electroDragon!.charge!.target).toEqual({
              id: 2,
              building: true,
            });
          else
            expect(
              kind === 'bowler' ? changed.native!.bowler : changed.native!.attackWindup,
            ).toMatchObject({ engaged: true, target: { id: 2, building: true } });
        }
        portable(r);
      });
for (const version of [196, 197])
  it(`far Bowler pre-attack audio follows actual forced cancellation under version ${version}`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', 1, version, 'bowler', 1),
      pending = at(r, r.pending),
      after = at(r, r.impact),
      u = pending.units.find((u) => u.id === r.unitId)!,
      changed = after.units.find((u) => u.id === r.unitId)!;
    expect(u.native!.bowler).toMatchObject({ engaged: true, target: { id: 2, building: true } });
    expect(u.native!.bowler!.audio!.charge).toBeDefined();
    const cues = (b: Battle) =>
      troopSoundCues(b, new BattleSoundLog()).filter((c) =>
        c.key.startsWith(`troop:${r.unitId}:preAttack:`),
      );
    expect(cues(pending).length).toBeGreaterThan(0);
    if (version >= 197) {
      expect(changed.target).toBe(3);
      expect(changed.native!.bowler!.audio!.charge).toBeUndefined();
      expect(cues(after)).toHaveLength(0);
    } else expect(cues(after).length).toBeGreaterThan(0);
    portable(r);
  });
for (const version of [196, 197])
  it(`Angry retargeting preserves an already released Wizard fireball under version ${version}`, () => {
    const r = nativeTargetingSpellRecording('AngrySpell', 1, version, 'wizard', 3),
      pending = at(r, r.pending),
      shot = pending.projectiles!.find((p) => p.sourceId === r.unitId)!,
      after = at(r, r.impact);
    expect(shot.launched).toBeLessThan(r.pending);
    expect(shot.impact).toBeGreaterThan(r.impact);
    expect(after.units.find((u) => u.id === r.unitId)!.target).toBe(3);
    expect(after.projectiles!.some((p) => p.id === shot.id)).toBe(true);
    const viewer = portable(r);
    viewer.seekReplay(shot.impact + 0.05);
    while (viewer.replay!.seeking) viewer.step(0.05);
    const mine = viewer.battle!.buildings.find((b) => b.id === 2)!;
    expect(mine.hp).toBe(mine.maxHp - shot.damage);
  });
it('forced retargeting preserves Bowler recovery instead of restarting or bypassing it', () => {
  const old = nativeTargetingSpellRecording('AngrySpell', 1, 196, 'bowler', undefined, 1.3),
    current = nativeTargetingSpellRecording('AngrySpell', 1, 197, 'bowler', undefined, 1.3),
    before = at(current, current.pending).units.find((u) => u.id === current.unitId)!.native!
      .bowler!,
    after = at(current, current.impact).units.find((u) => u.id === current.unitId)!.native!.bowler!,
    historical = at(old, old.impact).units.find((u) => u.id === old.unitId)!.native!.bowler!;
  expect(before.recovery).toBeGreaterThan(0);
  expect(after.recovery).toBeGreaterThan(0);
  expect(after.recovery).toBeCloseTo(historical.recovery, 8);
  expect(before.audio!.history!.length).toBeGreaterThan(0);
  expect(after.audio!.history).toEqual(before.audio!.history);
  expect(after.engaged).toBeUndefined();
});
it('only a carried Angry Spell enables the new cancellation boundary', () => {
  const r = nativeTargetingSpellRecording('AngrySpell', 1, 196, 'archer');
  expect(replayBattle(r.data.initial, 197).nativeAngryChargeReset).toBe(true);
  expect(replayBattle(r.data.initial, 196).nativeAngryChargeReset).toBeUndefined();
  r.data.initial.spells.angry = 0;
  expect(replayBattle(r.data.initial, 197).nativeAngryChargeReset).toBeUndefined();
});
