import { expect, it } from 'vitest';
import { archerTowerBattle } from './fixtures/archer-tower-battle';
import { stepArcherTower } from '../src/game/archer-tower-attack';
import { battleTowerArcherPose } from '../src/game/archer-tower-facing';
function arena() {
  const b = archerTowerBattle().battle!;
  const tower = b.buildings.find((b) => b.kind === 'archertower')!;
  const target = b.units[0];
  target.x = 22;
  target.y = 20;
  b.units = [target];
  b.elapsed = 0;
  const step = (at: number, enabled = true) => {
    const dt = at - b.elapsed;
    b.elapsed = at;
    stepArcherTower(b, tower, dt, enabled, 31.5, () => {});
  };
  return { b, tower, target, step };
}
it('draws before first release and keeps exact half-second release cadence', () => {
  const { b, tower, step } = arena();
  step(0.05);
  expect(b.projectiles ?? []).toHaveLength(0);
  expect(battleTowerArcherPose(tower, b, b.elapsed)).toMatchObject({ action: 'attack', time: 0 });
  step(0.15);
  expect(battleTowerArcherPose(tower, b, b.elapsed).time).toBeCloseTo(0.1);
  step(0.25);
  expect(b.projectiles ?? []).toHaveLength(0);
  step(0.3);
  expect(b.projectiles![0].launched).toBeCloseTo(0.05 + 5 / 24);
  for (let i = 7; i <= 40; i++) step(i * 0.05);
  const shots = b.projectiles!;
  expect(shots).toHaveLength(4);
  for (let i = 1; i < shots.length; i++)
    expect(shots[i].launched - shots[i - 1].launched).toBeCloseTo(0.5);
});
it('cancels lost targets and restarts a full draw after stun or reacquisition', () => {
  const { b, tower, target, step } = arena();
  step(0.05);
  step(0.15);
  target.x = 50;
  step(0.2);
  expect(b.archerTowerWindups![tower.id].pending).toBeUndefined();
  target.x = 22;
  step(0.25);
  expect(b.archerTowerWindups![tower.id].pending!.releaseAt).toBeCloseTo(0.25 + 5 / 24);
  b.defenseStuns[tower.id] = 0.5;
  step(0.3);
  expect(b.archerTowerWindups![tower.id].pending).toBeUndefined();
  step(0.5);
  step(0.55);
  expect(b.archerTowerWindups![tower.id].pending!.startedAt).toBe(0.55);
  const clone = JSON.parse(JSON.stringify(b));
  expect(battleTowerArcherPose(tower, clone, clone.elapsed)).toEqual(
    battleTowerArcherPose(tower, b, b.elapsed),
  );
  step(0.6, false);
  expect(b.archerTowerWindups![tower.id].pending).toBeUndefined();
  expect(b.projectiles ?? []).toHaveLength(0);
});
