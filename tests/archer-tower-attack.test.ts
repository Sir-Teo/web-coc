import { expect, it } from 'vitest';
import { archerTowerBattle } from './fixtures/archer-tower-battle';
import { battleTowerArcherPose } from '../src/game/archer-tower-facing';
import { towerArcherAttackTiming } from '../src/game/archer-tower-art';
it('records actual releases and holds follow-through after projectile retirement without mutation', () => {
  const model = archerTowerBattle(),
    battle = model.battle!;
  const tower = battle.buildings.find((b) => b.kind === 'archertower')!;
  for (let step = 0; step < 200 && !battle.archerTowerShots?.[tower.id]; step++) model.step(0.05);
  const shot = battle.archerTowerShots![tower.id];
  expect(shot).toBeDefined();
  expect(battle.projectiles!.find((p) => p.sourceId === tower.id)!.launched).toBe(shot.at);
  battle.projectiles = [];
  for (let level = 1; level <= 21; level++) {
    tower.level = level;
    const timing = towerArcherAttackTiming(level);
    expect(timing.release).toBe(5 / 24);
    battle.elapsed = shot.at;
    expect(battleTowerArcherPose(tower, battle, battle.elapsed)).toMatchObject({
      action: 'attack',
      time: 5 / 24,
    });
    battle.elapsed += 0.1;
    const before = JSON.stringify(battle);
    const pose = battleTowerArcherPose(tower, battle, battle.elapsed);
    expect(pose.action).toBe('attack');
    expect(pose.time).toBeCloseTo(5 / 24 + 0.1);
    expect(battleTowerArcherPose(tower, JSON.parse(before), battle.elapsed)).toEqual(pose);
    expect(JSON.stringify(battle)).toBe(before);
    expect(battleTowerArcherPose(tower, battle, battle.elapsed, true).action).toBe('idle');
    battle.defenseStuns[tower.id] = battle.elapsed + 1;
    expect(battleTowerArcherPose(tower, battle, battle.elapsed).action).toBe('idle');
    delete battle.defenseStuns[tower.id];
    battle.elapsed = shot.at + timing.duration;
    expect(battleTowerArcherPose(tower, battle, battle.elapsed).action).toBe('idle');
    battle.elapsed = shot.at - 0.01;
    expect(battleTowerArcherPose(tower, battle, battle.elapsed).action).toBe('idle');
  }
});
