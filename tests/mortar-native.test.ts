import { expect, it, vi } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { BUILDINGS, buildingHp, maxLevelFor, upgradeCost, upgradeSeconds } from '../src/game/data';
import { MORTAR_LEVELS, mortarProjectileRow } from '../src/game/mortar-stats';
import { requiredTownHall } from '../src/game/progression';
import { validateSave } from '../src/game/save';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import {
  launchMortarShell,
  stepMortarShells,
  recordMortarDestroyed,
} from '../src/game/mortar-attack';
import { mortarFacing, mortarPose, mortarProjectilePose } from '../src/game/mortar-poses';
import { mortarEffectPoses, mortarSoundCues, mortarTrailPoses } from '../src/game/mortar-effects';
import { mortarShake } from '../src/game/mortar-shake';
import { mortarBattle, mortarVillage } from './fixtures/mortar-battle';
import { REPLAY_VERSION } from '../src/game/replay';
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('retains every original normal level without exceeding home Town Hall eight limits', () => {
  expect(BUILDINGS.mortar.maxLevel).toBe(18);
  expect(maxLevelFor('mortar', 8)).toBe(6);
  for (const row of MORTAR_LEVELS) {
    expect(buildingHp('mortar', row.level)).toBe(row.hp);
    expect(requiredTownHall('mortar', row.level)).toBe(row.townhall);
    if (row.level > 1) {
      expect(upgradeCost('mortar', row.level - 1)).toBe(row.cost);
      expect(upgradeSeconds('mortar', row.level - 1)).toBe(row.seconds);
    }
    const m = new GameModel(mortarVillage(row.level));
    expect(validateSave(m.state)).toBe(true);
    if (row.level >= 6) {
      m.state.gold = 30000000;
      m.upgrade(6);
      expect(m.state.buildings[5].upgradeEnd).toBeUndefined();
      expect(m.state.gold).toBe(30000000);
    }
  }
});

it('uses source speed at both range boundaries while old recordings retain fixed flight', () => {
  const m = mortarBattle(),
    b = m.battle!,
    tower = b.buildings[5];
  for (const level of [1, 6, 8, 11, 16, 17, 18]) {
    tower.level = level;
    for (const distance of [4, 5.5, 11]) {
      const target = { x: tower.x + 1.5 + distance, y: tower.y + 1.5 };
      const shell = launchMortarShell(b, tower, target, 20, () => {});
      expect(shell.impact - shell.launched).toBeCloseTo(distance / 5, 12);
      expect(mortarProjectileRow(level).Speed).toBe('500');
    }
  }
  b.legacyMortarFlight = true;
  expect(launchMortarShell(b, tower, { x: 30, y: 30 }, 20, () => {}).impact - b.elapsed).toBe(1.15);
});

it('keeps a fixed landing site after target movement or launcher destruction and hits the inclusive ground radius once', () => {
  const m = mortarBattle(),
    b = m.battle!,
    tower = b.buildings[5],
    u = b.units[0];
  b.units = Array.from({ length: 5 }, (_, i) => ({
    ...u,
    id: 800 + i,
    x: 26 + [0, 1.5, 1.5001, 0, 0][i],
    y: 20,
    hp: 500,
    maxHp: 500,
    kind: i === 3 ? ('balloon' as const) : ('giant' as const),
    spawnedAt: i === 4 ? 99 : 0,
  }));
  const shell = launchMortarShell(b, tower, { x: 26, y: 20 }, 80, () => {});
  b.units[0].x = 32; // target can escape the saved aim point.
  tower.hp = 0;
  recordMortarDestroyed(b, tower, 0.2);
  b.elapsed = shell.impact;
  const effects: unknown[] = [];
  stepMortarShells(b, (e) => effects.push(e));
  expect(b.units.map((v) => v.hp)).toEqual([500, 420, 500, 500, 500]);
  expect(b.mortars![tower.id].hits).toEqual([
    { index: 1, level: 11, at: shell.impact, x: 26, y: 20 },
  ]);
  expect(b.mortars![tower.id].destroyedAt).toBe(0.2);
  expect(effects).toHaveLength(1);
  stepMortarShells(b, (e) => effects.push(e));
  expect(effects).toHaveLength(1);
  expect(b.shells).toHaveLength(0);
});

it('bounds presentation history without spending combat randomness or removing live projectiles', () => {
  const b = mortarBattle().battle!,
    tower = b.buildings[5],
    random = vi.spyOn(Math, 'random');
  for (let i = 0; i < 40; i++) {
    b.elapsed = i * 5;
    const s = launchMortarShell(b, tower, { x: 26, y: 20 }, 0, () => {});
    b.elapsed = s.impact;
    stepMortarShells(b, () => {});
  }
  const h = b.mortars![tower.id];
  expect([h.fired, h.shots.length, h.hits.length]).toEqual([40, 16, 16]);
  expect(h.shots[0].index).toBe(25);
  expect(h.hits.at(-1)!.index).toBe(40);
  expect(random).not.toHaveBeenCalled();
  random.mockRestore();
});

it('aims through eight original sectors and retains the last actual shot on target loss and stun', () => {
  for (let d = 0; d < 8; d++) {
    const a = (d * Math.PI) / 4;
    expect(mortarFacing(Math.cos(a), Math.sin(a))).toBe(d * 45);
  }
  const b = mortarBattle().battle!,
    tower = b.buildings[5],
    target = b.units[0];
  target.x = tower.x + 1.5;
  target.y = tower.y + 7.5;
  b.defenseTargets[tower.id] = target.id;
  expect(mortarPose(tower, b).turret).toBe(90);
  launchMortarShell(b, tower, { x: tower.x - 5, y: tower.y + 1.5 }, 20, () => {});
  b.defenseStuns[tower.id] = 100;
  expect(mortarPose(tower, b).turret).toBe(180);
  target.hp = 0;
  expect(mortarPose(tower, b).turret).toBe(180);
  expect(mortarPose({ ...tower, hp: 0 }, b).state).toBe('ruin');
});

it('samples thirteen original shell families from simulation time without target tracking or rotation', () => {
  const b = mortarBattle().battle!,
    tower = b.buildings[5];
  const families = new Set<string>();
  for (const level of MORTAR_LEVELS.map((r) => r.level)) {
    tower.level = level;
    const shell = launchMortarShell(b, tower, { x: 25.5, y: 19.5 }, 20, () => {});
    const start = mortarProjectilePose(level, shell, shell.launched, iso);
    const middle = mortarProjectilePose(level, shell, (shell.launched + shell.impact) / 2, iso);
    const end = mortarProjectilePose(level, shell, shell.impact, iso);
    families.add(mortarProjectileRow(level).Name);
    expect(start.t).toBe(0);
    expect(middle.t).toBeCloseTo(0.5, 12);
    expect(end.t).toBe(1);
    expect(start.from).toEqual({ x: iso(19.7, 19.5).x, y: iso(19.7, 19.5).y - 76 });
    expect([end.x, end.y]).toEqual([iso(shell.x, shell.y).x, iso(shell.x, shell.y).y]);
    expect(middle.y).toBeLessThan(start.y);
    expect(start.export).toBe(mortarProjectileRow(level).ExportName);
    expect(start.poses.length).toBeGreaterThan(0);
    expect(start.shadow.length).toBeGreaterThan(0);
    expect(mortarProjectileRow(level).UseRotate).toBe('FALSE');
  }
  expect(families.size).toBe(13);
});

it('reconstructs trails after impact, repeated hit emitters and reduced ground feedback', () => {
  const b = mortarBattle().battle!,
    tower = b.buildings[5];
  for (const level of [1, 6, 8, 11, 16, 17, 18]) {
    tower.level = level;
    launchMortarShell(b, tower, { x: 25.5, y: 19.5 }, 20, () => {});
    const shot = b.mortars![tower.id].shots.at(-1)!;
    expect(mortarTrailPoses(shot, shot.impact + 0.05, iso).length).toBeGreaterThan(0);
    expect(mortarTrailPoses(shot, shot.impact + 1, iso)).toEqual([]);
  }
  const hit = mortarEffectPoses(6, 'hit', 1, 'Mortar Hit', 0, 0.1, { x: 10, y: 20 }, false);
  expect(hit.filter((p) => p.emitter === 'Grass')).toHaveLength(6);
  const reduced = mortarEffectPoses(6, 'hit', 1, 'Mortar Hit', 0, 0.1, { x: 10, y: 20 }, true);
  expect(new Set(reduced.map((p) => p.emitter))).toEqual(new Set(['Ring']));
  expect(
    mortarEffectPoses(6, 'hit', 1, 'Mortar Hit lvl6', 0, 0.1, { x: 10, y: 20 }, true).map(
      (p) => p.emitter,
    ),
  ).toEqual(['bomb_crater_small']);
  expect(mortarEffectPoses(6, 'attack', 1, 'Mortar Attack', 0, 0.1, { x: 0, y: 0 }, true)).toEqual(
    [],
  );
  for (const [name, volume, min, max] of [
    ['Mortar Attack', 0.7, 0.95, 1.05],
    ['Mortar Hit', 0.9, 0.95, 1.05],
    ['Mortar Pickup', 0.8, 1, 1],
    ['Mortar Placing', 0.8, 1, 1],
  ] as const) {
    const cues = mortarSoundCues(6, 'sample', 1, name, 2);
    expect(cues).toHaveLength(1);
    expect(cues[0].volume).toBe(volume);
    expect(cues[0].pitch).toBeGreaterThanOrEqual(min);
    expect(cues[0].pitch).toBeLessThanOrEqual(max);
    expect(cues).toEqual(mortarSoundCues(6, 'sample', 1, name, 2));
  }
});

it('samples hit camera impulses at battle time, including replay, pause and reduced motion', () => {
  const b = mortarBattle().battle!;
  b.mortars = { 6: { fired: 1, shots: [], hits: [{ index: 1, level: 1, at: 1, x: 0, y: 0 }] } };
  b.elapsed = 1.12;
  const pose = mortarShake(b, false);
  expect(pose).not.toEqual({ x: 0, y: 0 });
  expect(mortarShake(b, false, true)).toEqual(pose);
  expect(mortarShake(b, true)).toEqual({ x: 0, y: 0 });
  b.elapsed = 1.85;
  expect(mortarShake(b, false)).toEqual({ x: 0, y: 0 });
});

for (const level of [1, 6, 8, 11, 16, 17, 18])
  it(`replays and seeks complete natural level ${level} combat without changing the home village`, () => {
    const m = mortarBattle(level),
      snapshots = new Map<number, string>();
    for (let i = 0; i < 4000 && !m.battle!.finished; i++) {
      if ([1, 10, 21, 39, 70, 100, 200, 500].includes(i))
        snapshots.set(i, JSON.stringify(m.battle));
      m.step(0.05);
    }
    expect(m.battle!.finished).toBe(true);
    expect(m.battle!.mortars?.[6]?.fired).toBeGreaterThan(0);
    const end = JSON.stringify(m.battle),
      replay = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay!)));
    expect(replay.version).toBe(REPLAY_VERSION);
    m.returnHome();
    const home = JSON.stringify(m.state);
    expect(m.openReplay(replay)).toBe(true);
    expect(m.battle!.legacyMortarFlight).toBeUndefined();
    const seek = (at: number) => {
      m.seekReplay(at);
      while (m.replay!.seeking) m.step(0.05);
      return JSON.parse(JSON.stringify(m.battle));
    };
    for (const [step, state] of [...snapshots.entries()].reverse())
      expect(seek(step * 0.05)).toEqual(JSON.parse(state));
    expect(seek(9999)).toEqual(JSON.parse(end));
    m.returnHome();
    expect(JSON.stringify(m.state)).toBe(home);
  });
