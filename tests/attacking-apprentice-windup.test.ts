import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { nativeDirectBattle, nativeDirectRecording } from './fixtures/native-direct-attacks';

// Independently transcribed source character damage and aura percentages, levels 1–4.
const damage = [153, 166.5, 180, 193.5];
for (let level = 1; level <= 4; level++)
  for (const x of [11.4, 6.9])
    it(`Apprentice Warden ${level} charges .9 s after approaching from x=${x}`, () => {
      const r = nativeDirectBattle('apprenticewarden', level, undefined, x),
        target = r.battle.buildings.find((b) => b.id === 2)!;
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed,
        hp = target.hp;
      expect(r.unit.native!.attacks ?? 0).toBe(0);
      expect(r.battle.projectiles?.some((p) => p.sourceId === r.unit.id)).toBe(false);
      r.untilAttacks(1);
      const first = r.battle.elapsed,
        shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
      expect(first - engaged + 0.05).toBeCloseTo(0.9, 8);
      expect(shot.native).toMatchObject({
        name: level <= 2 ? 'ApprenticeWarden_small' : 'ApprenticeWarden_small2',
        kind: 'apprenticewarden',
        level,
      });
      expect(shot.damage).toBe(damage[level - 1]);
      expect(shot.targetBuilding).toBe(true);
      expect(target.hp).toBe(hp);
      r.until(shot.impact);
      expect(target.hp).toBeCloseTo(hp - damage[level - 1], 8);
      r.untilAttacks(2);
      expect(r.battle.elapsed - first).toBeCloseTo(0.9, 8);
    });

for (const air of [false, true])
  it(`releases the native single-target shot at a ${air ? 'flying' : 'ground'} guard`, () => {
    const r = nativeDirectBattle('apprenticewarden'),
      guard = spawnGarrisonDefender(
        r.battle,
        air ? 'dragon' : 'golem',
        air ? 7 : 8,
        1,
        12,
        11.5,
        0,
      );
    guard.alerted = true;
    guard.stunnedUntil = 100;
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    expect(r.unit.native!.attackWindup!.target).toEqual({ id: guard.id, building: false });
    r.untilAttacks(1);
    const shot = r.battle.projectiles!.find((p) => p.sourceId === r.unit.id)!;
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(0.9, 8);
    expect(shot).toMatchObject({
      weapon: 'native',
      targetDefender: true,
      toAir: air,
      fromAir: false,
    });
    expect(guard.hp).toBe(guard.maxHp);
    r.until(shot.impact);
    expect(guard.hp).toBe(guard.maxHp - 153);
  });

for (const slowed of [false, true])
  it(`scales the source windup and repeat period, slowed=${slowed}`, () => {
    const r = nativeDirectBattle('apprenticewarden');
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed,
      scale = slowed ? 2 : 0.5;
    r.untilAttacks(1);
    const first = r.battle.elapsed;
    expect(first - engaged + 0.05).toBeCloseTo(0.9 * scale, 8);
    r.untilAttacks(2);
    expect(r.battle.elapsed - first).toBeCloseTo(0.9 * scale, 8);
  });

it('Freeze holds the attack charge while the existing health aura still pulses', () => {
  const r = nativeDirectBattle('apprenticewarden');
  r.model.activeTroop = 'archer';
  expect(r.model.deploy(10.4, 11.5)).toBe(true);
  const ally = r.battle.units.find((u) => u.kind === 'archer')!;
  while (!r.unit.attacking) r.step();
  const engaged = r.battle.elapsed,
    aura = r.battle.nativeSpells!.find((s) => s.name === 'Apprentice Aura')!,
    pulses = aura.hits;
  r.unit.native!.effects = { frozenUntil: engaged + 1 };
  r.until(engaged + 1);
  expect(r.unit.native!.attacks ?? 0).toBe(0);
  expect(aura.hits).toBeGreaterThan(pulses);
  expect(aura.interval).toBe(0.3);
  expect(ally.native!.effects!.extraHp!.capacity).toBeCloseTo(ally.maxHp * 0.2, 8);
  expect(r.unit.native!.effects!.extraHp).toBeUndefined();
  r.untilAttacks(1);
  expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1.9, 8);
});

it('restarts a full charge after the original building is destroyed', () => {
  const r = nativeDirectBattle('apprenticewarden');
  r.battle.buildings.push(makeBuilding(3, 'goldstorage', 13, 10, 18));
  while (!r.unit.attacking) r.step();
  r.until(r.battle.elapsed + 0.3);
  r.model.damage(
    r.battle.buildings.find((b) => b.id === 2)!,
    100000,
  );
  r.step();
  const changed = r.battle.elapsed;
  expect(r.unit.native!.attackWindup!.target).toEqual({ id: 3, building: true });
  r.untilAttacks(1);
  expect(r.battle.elapsed - changed + 0.05).toBeCloseTo(0.9, 8);
});

it('jumps a full wall line and charges the building from its source range', () => {
  const r = nativeDirectBattle('apprenticewarden', 1, undefined, 6.9),
    target = r.battle.buildings.find((b) => b.id === 2)!;
  target.x = 22;
  const walls = Array.from({ length: 48 }, (_, y) => makeBuilding(1000 + y, 'wall', 12, y, 15));
  r.battle.buildings.push(...walls);
  while (!r.unit.attacking) r.step();
  expect(r.unit.x).toBeGreaterThan(12);
  expect(r.unit.target).toBe(2);
  r.untilAttacks(1);
  expect(walls.every((w) => w.hp === w.maxHp)).toBe(true);
});

for (const version of [179, 180])
  for (const level of [1, 4])
    for (const guard of [false, true, 'air'] as const)
      it(`level ${level} ${guard || 'Cannon'} fight preserves complete version ${version} replay state`, () => {
        const r = nativeDirectRecording('apprenticewarden', 180, version, level, guard),
          model = new GameModel();
        expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          model.seekReplay(s.at);
          while (model.replay!.seeking) model.step(0.05);
          expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
        }
      });

it('gates the new clock to carried Apprentice Wardens and current recordings', () => {
  const setup = structuredClone(nativeDirectBattle('apprenticewarden').data.initial);
  expect(replayBattle(setup).nativeApprenticeWindup).toBe(true);
  expect(replayBattle(setup, 179).nativeApprenticeWindup).toBeUndefined();
  setup.army.apprenticewarden = 0;
  expect(replayBattle(setup).nativeApprenticeWindup).toBeUndefined();
});
