import { expect, it } from 'vitest';
import { archerTowerBattle } from './fixtures/archer-tower-battle';
import { archerTowerDestructionPoses } from '../src/game/archer-tower-effects';
import { archerTowerDestructionCues } from '../src/game/archer-tower-sounds';
const iso = (x: number, y: number) => ({ x: x * 32, y: y * 16 });
it('records first destruction and reconstructs original debris, smoke, grass and sound at every tier', () => {
  for (let level = 1; level <= 21; level++) {
    const model = archerTowerBattle(level),
      battle = model.battle!;
    const tower = battle.buildings.find((b) => b.kind === 'archertower')!;
    model.damage(tower, tower.hp, 10);
    model.damage(tower, 100, 11);
    expect(battle.archerTowerDestructions![tower.id]).toEqual({ at: 10, level, x: 19.5, y: 19.5 });
    battle.elapsed = 10.15;
    const before = JSON.stringify(battle);
    const poses = archerTowerDestructionPoses(battle, false, iso);
    expect(poses).toHaveLength(43);
    expect(poses.filter((p) => p.emitter === 'Building Destroyed')).toHaveLength(30);
    expect(poses.filter((p) => p.emitter === 'Smoke')).toHaveLength(10);
    expect(poses.filter((p) => p.emitter === 'Grass')).toHaveLength(3);
    expect(archerTowerDestructionPoses(JSON.parse(before), false, iso)).toEqual(poses);
    expect(JSON.stringify(battle)).toBe(before);
    const cue = archerTowerDestructionCues(battle)[0];
    expect(cue).toMatchObject({
      at: 10,
      volume: 0.8,
      sample: 'archer-tower-building_destroyed_01.ogg',
    });
    expect(cue.pitch).toBeGreaterThanOrEqual(0.85);
    expect(cue.pitch).toBeLessThanOrEqual(0.95);
    expect(archerTowerDestructionPoses(battle, true, iso)).toEqual([]);
    battle.elapsed = 9;
    expect(archerTowerDestructionPoses(battle, false, iso)).toEqual([]);
    battle.elapsed = 13;
    expect(archerTowerDestructionPoses(battle, false, iso)).toEqual([]);
  }
  const legacy = archerTowerBattle();
  delete legacy.battle!.nativeArcherTowers;
  const tower = legacy.battle!.buildings.find((b) => b.kind === 'archertower')!;
  legacy.damage(tower, tower.hp);
  expect(Object.hasOwn(legacy.battle!, 'archerTowerDestructions')).toBe(false);
});
