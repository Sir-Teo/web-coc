import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { BattleSoundLog, troopSoundCues } from '../src/game/troop-sounds';
import { attackingBowlerBattle } from './fixtures/attacking-bowler';
import { bowlerPursuitWallRecording } from './fixtures/bowler-pursuit-wall';

function arena(level = 1, version?: number) {
  const r = attackingBowlerBattle(level, version);
  for (let y = 0; y < 48; y++) r.battle.buildings.push(makeBuilding(1000 + y, 'wall', 12, y, 15));
  const guard = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 17.4, 11.5, 0);
  guard.alerted = true;
  guard.stunnedUntil = 100;
  return { ...r, guard };
}
for (let level = 1; level <= 10; level++)
  it(`Bowler ${level} charges native pursuit-wall boulders at the source cadence`, () => {
    const r = arena(level);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    expect(r.unit.native!.bowler!.target?.building).toBe(true);
    expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
    r.untilAttacks(1);
    const first = r.battle.elapsed,
      shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id && p.targetBuilding)!;
    expect(first - engaged + 0.05).toBeCloseTo(0.4, 8);
    expect(shot).toMatchObject({
      weapon: 'native',
      splash: 0.3,
      native: { kind: 'bowler', level },
    });
    const wall = r.battle.buildings.find((b) => b.id === shot.targetId)!;
    expect(wall.kind).toBe('wall');
    r.until(shot.impact + 0.05);
    expect(wall.hp).toBeCloseTo(wall.maxHp - nativeUnitStats('bowler', level).damage, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(2.2, 8);
    expect(
      r.battle.projectiles!.some((p) => p.sourceId === r.unit.id && p.weapon === 'arrow'),
    ).toBe(false);
    expect(r.unit.native!.bowler!.audio!.history).toHaveLength(2);
  });
it('a blocking wall cannot reset Bowler recovery into one arrow per update', () => {
  const r = arena();
  r.until(6);
  const throws = r.battle.nativeBowlerFlights!.filter((p) => !p.native?.bounce);
  expect(throws).toHaveLength(3);
  expect(throws.map((p) => p.launched - throws[0].launched)).toEqual([
    expect.closeTo(0, 8),
    expect.closeTo(2.2, 8),
    expect.closeTo(4.4, 8),
  ]);
  expect(r.unit.native!.attacks).toBe(3);
});
it('Freeze holds the wall windup without a fallback arrow release', () => {
  const r = arena();
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.until(engaged + 0.9);
  expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.4, 8);
});
it('the wall throw keeps one original pre-attack take through release', () => {
  const r = arena();
  while (!r.unit.attacking) r.step();
  const charge = r.unit.native!.bowler!.audio!.charge!,
    before = troopSoundCues(r.battle, new BattleSoundLog()).find((c) => c.key === charge.key)!;
  expect(before).toBeDefined();
  r.untilAttacks(1);
  const tails = troopSoundCues(r.battle, new BattleSoundLog()).filter((c) => c.key === charge.key);
  expect(tails).toHaveLength(1);
  expect(tails[0].at).toBeCloseTo(before.at, 8);
});
it('version 162 retains its recorded generic pursuit-wall arrow burst', () => {
  const r = arena(1, 162);
  r.until(0.5);
  const shots = r.battle.projectiles!.filter((p) => p.sourceId === r.unit.id);
  expect(shots.length).toBeGreaterThanOrEqual(2);
  expect(shots.every((p) => p.weapon === 'arrow')).toBe(true);
  for (let i = 1; i < shots.length; i++)
    expect(shots[i].launched - shots[i - 1].launched).toBeCloseTo(0.05, 8);
});
for (const version of [162, 163])
  it(`actual Castle/wall inputs reproduce complete version-${version} states in both directions`, () => {
    const r = bowlerPursuitWallRecording(version),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
    if (version === 163) {
      expect(r.shots.every((p) => p.weapon === 'native')).toBe(true);
      for (let i = 1; i < r.shots.length; i++)
        expect(r.shots[i].launched - r.shots[i - 1].launched).toBeCloseTo(2.2, 8);
    } else expect(r.shots.filter((p) => p.weapon === 'arrow').length).toBeGreaterThan(10);
  });
it('only carried Bowler armies enable native pursuit-wall releases', () => {
  const s = structuredClone(attackingBowlerBattle().data.initial);
  expect(replayBattle(s).nativeBowlerWallWindup).toBe(true);
  expect(replayBattle(s, 162).nativeBowlerWallWindup).toBeUndefined();
  s.army.bowler = 0;
  expect(replayBattle(s).nativeBowlerWallWindup).toBeUndefined();
});

it('the committed wall remains the visual aim while its pursued defender moves', () => {
  const r = arena();
  while (!r.unit.attacking) r.step();
  const wall = r.battle.buildings.find((b) => b.id === r.unit.native!.bowler!.target!.id)!;
  r.guard.y = 15;
  r.step();
  expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: wall.x + 0.5, y: wall.y + 0.5 });
  delete r.battle.nativeBowlerWallWindup;
  expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: r.guard.x, y: r.guard.y });
});

it('a pursued defender entering range can interrupt the committed wall charge', () => {
  const r = arena();
  while (!r.unit.attacking) r.step();
  r.guard.x = r.unit.x + 0.1;
  r.guard.y = r.unit.y;
  r.step();
  const engaged = r.battle.elapsed;
  expect(r.unit.native!.bowler!.target).toEqual({ id: r.guard.id, building: false });
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.4, 8);
  expect(r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!.targetDefender).toBe(true);
});
