import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { BUILDINGS } from '../src/game/data';
import { superHogLanding, superHogSplitStats } from '../src/game/native-super-hog';
import { hurtUnit } from '../src/game/native-status';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { superHogSplitBattle, superHogSplitRecording } from './fixtures/super-hog-split';

for (let level = 1; level <= 12; level++)
  it(`Super Hog Rider ${level} releases one source Hog and lands the Rider after 1.3 s`, () => {
    const r = superHogSplitBattle(level),
      stats = superHogSplitStats(level);
    expect(stats).toMatchObject({
      range: 3.5,
      duration: 1.3,
      hog: { kind: 'superhog', level },
      rider: { kind: 'superrider', level },
    });
    r.step();
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    const origin = { x: r.unit.x, y: r.unit.y };
    r.step();
    const at = r.unit.defeatedAt!,
      hog = r.battle.units.find((u) => u.kind === 'superhog')!,
      shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
    expect(hog).toMatchObject({
      ...origin,
      spawnedAt: at,
      level,
      hp: nativeUnitStats('superhog', level).hp,
      native: { owner: r.unit.id },
    });
    expect(shot).toMatchObject({
      sourceId: r.unit.id,
      launched: at,
      impact: at + 1.3,
      damage: 0,
      native: { name: `JumpingRiderProjectile${level}`, level },
    });
    const target = r.battle.buildings.find((b) => b.id === r.unit.target)!,
      half = BUILDINGS[target.kind].size / 2,
      dx = target.x + half - origin.x,
      dy = target.y + half - origin.y,
      rx = shot.x - origin.x,
      ry = shot.y - origin.y;
    expect(Math.hypot(rx, ry)).toBeCloseTo(3.5, 10);
    expect(dx * ry - dy * rx).toBeCloseTo(0, 10);
    expect(dx * rx + dy * ry).toBeLessThan(0);
    expect(r.battle.units.some((u) => u.kind === 'superrider')).toBe(false);
    r.until(shot.impact - 0.05);
    expect(r.battle.units.some((u) => u.kind === 'superrider')).toBe(false);
    r.until(shot.impact);
    const rider = r.battle.units.find((u) => u.kind === 'superrider')!;
    expect(rider).toMatchObject({
      level,
      spawnedAt: shot.impact,
      hp: nativeUnitStats('superrider', level).hp,
      native: { owner: r.unit.id },
    });
    expect(rider.x).toBeCloseTo(shot.x, 10);
    expect(rider.y).toBeCloseTo(shot.y, 10);
    expect(r.battle.nativePendingSpawns).toEqual([]);
    r.until(r.battle.elapsed + 0.2);
    expect(r.battle.units.filter((u) => u.kind === 'superhog')).toHaveLength(1);
    expect(r.battle.units.filter((u) => u.kind === 'superrider')).toHaveLength(1);
  });

for (const x of [0.5, 24, 47.5])
  for (const y of [0.5, 24, 47.5])
    it(`targetless release remains finite inside the map at ${x},${y}`, () => {
      const r = superHogSplitBattle();
      r.unit.x = x;
      r.unit.y = y;
      const p = superHogLanding(r.battle, r.unit, new Map(), 3.5);
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0.5);
      expect(p.x).toBeLessThanOrEqual(47.5);
      expect(p.y).toBeGreaterThanOrEqual(0.5);
      expect(p.y).toBeLessThanOrEqual(47.5);
    });

it('the airborne Rider keeps combat open after the Hog is defeated', () => {
  const r = superHogSplitBattle();
  r.step();
  hurtUnit(r.battle, r.unit, r.unit.maxHp);
  r.step();
  const shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
  hurtUnit(
    r.battle,
    r.battle.units.find((u) => u.kind === 'superhog')!,
    100000,
  );
  r.step();
  expect(r.battle.units.some((u) => u.hp > 0)).toBe(false);
  expect(r.battle.finished).toBe(false);
  r.until(shot.impact);
  expect(r.battle.finished).toBe(false);
  expect(r.battle.units.some((u) => u.kind === 'superrider' && u.hp > 0)).toBe(true);
});

for (const expiry of [0.5, 3])
  it(`both split halves retain a clone deadline ${expiry} s after defeat`, () => {
    const r = superHogSplitBattle();
    r.step();
    const deadline = r.battle.elapsed + expiry;
    r.unit.native!.cloneUntil = deadline;
    hurtUnit(r.battle, r.unit, r.unit.maxHp);
    r.step();
    const shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
    expect(r.battle.units.find((u) => u.kind === 'superhog')!.native!.cloneUntil).toBe(deadline);
    r.until(shot.impact);
    const rider = r.battle.units.find((u) => u.kind === 'superrider');
    if (expiry < 1.3) expect(rider).toBeUndefined();
    else {
      expect(rider!.native!.cloneUntil).toBe(deadline);
      r.until(deadline);
      expect(r.battle.units.some((u) => u.hp > 0)).toBe(false);
    }
  });

it('JSON restoration during the throw retains one linked Rider arrival', () => {
  const r = superHogSplitBattle();
  r.step();
  hurtUnit(r.battle, r.unit, r.unit.maxHp);
  r.step();
  const impact = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!.impact;
  const model = new GameModel();
  model.state.nextId = r.model.state.nextId;
  model.battle = JSON.parse(JSON.stringify(r.battle));
  while (model.battle!.elapsed < impact - 1e-9) model.step(0.05);
  expect(model.battle!.units.filter((u) => u.kind === 'superrider')).toHaveLength(1);
  expect(model.battle!.nativePendingSpawns).toEqual([]);
});

it('Spring ejection releases neither half', () => {
  const r = superHogSplitBattle();
  r.unit.ejected = true;
  hurtUnit(r.battle, r.unit, r.unit.maxHp);
  r.step();
  expect(r.battle.nativeSuperHogFlights).toBeUndefined();
  expect(r.battle.units.some((u) => u.kind === 'superhog' || u.kind === 'superrider')).toBe(false);
});

for (const level of [1, 12])
  for (const version of [175, 176])
    it(`actual Monolith defeat reproduces complete level-${level} version-${version} portable snapshots`, () => {
      const r = superHogSplitRecording(level, version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
      }
      if (version < 176) expect(r.hogId).toBeUndefined();
      else expect(r.hogId !== undefined && r.riderId !== undefined).toBe(true);
    });

it('only carried Super Hog Rider armies enable the split', () => {
  const s = structuredClone(superHogSplitBattle().data.initial);
  expect(replayBattle(s).nativeSuperHogSplit).toBe(true);
  expect(replayBattle(s, 175).nativeSuperHogSplit).toBeUndefined();
  s.army.superhogrider = 0;
  expect(replayBattle(s).nativeSuperHogSplit).toBeUndefined();
});
