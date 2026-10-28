import { healerRecording } from './fixtures/attacking-healer';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { expect, it } from 'vitest';
import { druidBattle, druidRecording, druidEvolutionRecording } from './fixtures/attacking-druid';
import { nativeUnitStats } from '../src/game/native-units';
import { replayBattle } from '../src/game/replay';
import { applyShrink } from '../src/game/shrink-trap';
import { nativeTroopFacingTarget } from '../src/game/native-troop-facing';

for (let level = 1; level <= 6; level++)
  for (const x of [5, 1])
    it(`Druid${level} spends550ms cast and keeps1s repeats from${x}`, () => {
      const r = druidBattle(level, 211, x);
      while (!r.unit.attacking) r.step();
      const engaged = r.battle.elapsed;
      expect(r.shots).toHaveLength(0);
      expect(r.unit.native!.healerWindup!.animationOffset).toBeLessThan(0);
      r.untilCasts(1);
      expect(r.shots[0].at - engaged + 0.05).toBeCloseTo(0.55, 8);
      expect(r.shots[0].damage).toBe(nativeUnitStats('druid', level).heal);
      r.untilCasts(4);
      for (let n = 1; n < 4; n++) expect(r.shots[n].at - r.shots[0].at).toBeCloseTo(n, 8);
    });
for (const x of [5, 1])
  it(`version210 retains immediate Druid launch from${x}`, () => {
    const r = druidBattle(1, 210, x);
    while (!r.unit.attacking) r.step();
    expect(r.shots[0].at).toBe(r.battle.elapsed);
    expect(r.unit.native!.healerWindup).toBeUndefined();
  });
for (const level of [1, 6])
  it(`Druid${level} spends the same cast on an air recipient`, () => {
    const r = druidBattle(level, 211, 5, true);
    while (!r.unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    r.untilCasts(1);
    expect(r.shots[0].at - engaged + 0.05).toBeCloseTo(0.55, 8);
    expect(r.unit.healTarget).toBe(r.target.id);
  });
for (const hold of ['frozenUntil', 'stunUntil'] as const)
  it(`${hold} holds the Druid cast`, () => {
    const r = druidBattle(1, 211);
    r.step();
    r.unit.native!.effects = { [hold]: r.battle.elapsed + 1.025 };
    r.untilCasts(1);
    expect(r.shots[0].at).toBeCloseTo(1.6, 8);
  });
for (const slowed of [false, true])
  it(`Druid cast rates scale slowed=${slowed}`, () => {
    const r = druidBattle(1, 211);
    r.step();
    r.unit.native!.effects = slowed
      ? { poison: { since: 0, until: 100, dps: 0, speed: 0, attackSpeed: -0.5 } }
      : { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
    r.untilCasts(1);
    const first = r.shots[0].at;
    r.untilCasts(4);
    expect(Math.abs(r.shots[3].at - first - 3 * (slowed ? 2 : 0.5))).toBeLessThan(0.05 + 1e-8);
  });
it('Shrink scales the Druid cast without changing its pulse', () => {
  const r = druidBattle(1, 211);
  applyShrink(r.unit, 0);
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(1.1, 8);
  expect(r.shots[0].damage).toBe(80);
});
it('the Druid body faces its friendly cast recipient', () => {
  const r = druidBattle(1, 211);
  r.step();
  expect(nativeTroopFacingTarget(r.battle, r.unit)).toEqual({ x: r.target.x, y: r.target.y });
});
it('only a carried Druid enables the new controller', () => {
  const r = druidBattle();
  expect(replayBattle(r.data.initial, 211).nativeDruidWindup).toBe(true);
  expect(replayBattle(r.data.initial, 210).nativeDruidWindup).toBeUndefined();
  r.data.initial.army.druid = 0;
  expect(replayBattle(r.data.initial, 211).nativeDruidWindup).toBeUndefined();
});

for (const version of [210, 211])
  for (const level of [1, 6])
    for (const air of [false, true])
      it(`actual Druid${level} air=${air} reconstructs complete portable states version${version}`, () => {
        const r = druidRecording(version, level, 5, air),
          viewer = new GameModel();
        expect(r.shots[0].damage).toBe(nativeUnitStats('druid', level).heal);
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

for (const state of ['dead', 'removed', 'ejected', 'recalled', 'unborn'] as const)
  it(`a ${state} recipient cancels the pending Druid cast`, () => {
    const r = druidBattle(1, 211);
    r.step();
    if (state === 'dead') r.target.hp = 0;
    else if (state === 'removed')
      r.battle.units = r.battle.units.filter((u) => u.id !== r.target.id);
    else if (state === 'ejected') r.target.ejected = true;
    else if (state === 'recalled') r.target.native!.recalled = true;
    else r.target.spawnedAt = 100;
    for (let n = 0; n < 12; n++) r.step();
    expect(r.shots).toHaveLength(0);
    expect(r.unit.native!.healerWindup!.engaged).toBeUndefined();
  });
it('a replacement Druid recipient spends a fresh cast', () => {
  const r = druidBattle(1, 211);
  r.step();
  r.model.activeTroop = 'giant';
  expect(r.model.deploy(10, 11.5)).toBe(true);
  const next = r.battle.units.at(-1)!;
  next.hp = 100;
  (next.native ??= {}).effects = { frozenUntil: 100 };
  r.target.ejected = true;
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(0.6, 8);
});
it('Druid recipient switching retains remaining recovery once', () => {
  const r = druidBattle(1, 211);
  r.untilCasts(1);
  const first = r.shots[0].at;
  r.model.activeTroop = 'giant';
  expect(r.model.deploy(10, 11.5)).toBe(true);
  const next = r.battle.units.at(-1)!;
  next.hp = 100;
  (next.native ??= {}).effects = { frozenUntil: 100 };
  r.target.ejected = true;
  r.untilCasts(2);
  expect(r.shots[1].at - first).toBeCloseTo(1, 8);
});
it('a committed Druid cast finishes once before chasing its escaped recipient', () => {
  const r = druidBattle(1, 211);
  r.step();
  r.target.x = 25;
  r.untilCasts(1);
  expect(r.shots[0].at).toBeCloseTo(0.55, 8);
  r.step();
  expect(r.unit.native!.healerWindup!.engaged).toBeUndefined();
  while (r.battle.elapsed < 1.5 - 1e-9) r.step();
  expect(r.shots).toHaveLength(1);
});
it('Druid defeat cannot launch a pending cast', () => {
  const r = druidBattle(1, 211);
  r.step();
  r.unit.hp = 0;
  for (let n = 0; n < 12; n++) r.step();
  expect(r.shots).toHaveLength(0);
});
it('Freeze holds Druid recovery without creating overdue casts', () => {
  const r = druidBattle(1, 211);
  r.untilCasts(1);
  r.unit.native!.effects = { frozenUntil: r.battle.elapsed + 1.025 };
  r.untilCasts(2);
  expect(r.shots[1].at).toBeCloseTo(2.6, 8);
});
it('evolution discards the Druid cast instead of healing from the Bear body', () => {
  const r = druidBattle(1, 211);
  let evolved = false;
  const lateShots: string[] = [];
  while (r.battle.elapsed < 30.1 - 1e-9) {
    r.model.step(0.05);
    if (r.unit.kind === 'bear') evolved = true;
    for (const p of r.battle.projectiles ?? [])
      if (p.sourceId === r.unit.id && p.native?.healing && (p.launched ?? 0) >= 30 - 1e-9)
        lateShots.push(p.id);
  }
  expect(evolved).toBe(true);
  expect(lateShots).toEqual([]);
  expect(r.unit.native!.healerWindup).toBeUndefined();
  expect(r.unit.healTarget).toBeUndefined();
});

it('version210 retains its historical transformation-frame healing packet', () => {
  const r = druidBattle(1, 210);
  while (r.battle.elapsed < 30.05 - 1e-9) r.model.step(0.05);
  const packet = r.battle.projectiles!.find(
    (p) => p.sourceId === r.unit.id && p.native?.healing && (p.launched ?? 0) >= 30 - 1e-9,
  )!;
  expect(r.unit.kind).toBe('bear');
  expect(packet.native!.kind).toBe('bear');
  expect(packet.damage).toBe(80);
});
it('a released Druid flight still heals after its caster becomes a Bear', () => {
  const r = druidBattle(1, 211);
  r.target.maxHp = 1e6;
  r.step();
  r.unit.native!.effects = { boost: { until: 100, damage: 0, speed: 0, attackSpeed: 1 } };
  while (r.battle.elapsed < 30.05 - 1e-9) r.model.step(0.05);
  const packet = r.battle.projectiles!.find(
    (p) => p.sourceId === r.unit.id && p.native?.healing && p.impact > r.battle.elapsed,
  )!;
  expect(r.unit.kind).toBe('bear');
  expect(packet.native!.kind).toBe('druid');
  const hp = r.target.hp;
  while (r.battle.elapsed < packet.impact + 0.05 - 1e-9) r.model.step(0.05);
  expect(r.target.hp - hp).toBe(80);
});

it('generalizing the cast clock preserves complete Healer210 states', () => {
  const old = healerRecording(11, 210),
    current = healerRecording(11, 211);
  expect(current.snapshots).toEqual(old.snapshots);
});

for (const version of [210, 211])
  for (const level of [1, 6])
    it(`live Druid${level} evolution retains complete portable states version${version}`, () => {
      const r = druidEvolutionRecording(level, version),
        viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      }
    });
