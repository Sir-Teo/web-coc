import { describe, expect, it } from 'vitest';
import { unitPose } from '../src/game/unit-pose';
import { makeBuilding, type Unit } from '../src/game/model';

const troop = (kind: Unit['kind'] = 'archer'): Unit => ({
  id: 1,
  kind,
  x: 8,
  y: 12,
  hp: 100,
  maxHp: 100,
  cooldown: 0,
  target: 2,
  path: [{ x: 6, y: 12 }],
  pathAt: 1,
  attacking: false,
});
const hall = makeBuilding(2, 'townhall', 10, 10);
describe('troop facing and locomotion', () => {
  it('faces its navigation waypoint while going away from the final target', () => {
    expect(unitPose(troop(), hall)).toMatchObject({ facing: -1, flipX: false, moving: true });
  });
  it('faces the building center when attacking instead of the old path', () => {
    const u = troop();
    u.attacking = true;
    expect(unitPose(u, hall)).toMatchObject({ facing: 1, flipX: true, moving: false });
  });
  it('uses the opposite native orientation of specialist atlases and hero art', () => {
    const u = troop('goblin');
    expect(unitPose(u, hall).flipX).toBe(true);
    u.hero = 'king';
    expect(unitPose(u, hall).flipX).toBe(true);
  });
  it('flying troops face their target without following an obsolete ground waypoint', () => {
    expect(unitPose(troop('balloon'), hall)).toMatchObject({ facing: 1, moving: true });
  });
  it('holds its side while navigating vertically in the isometric view', () => {
    const u = troop();
    u.path = [{ x: 9, y: 13 }];
    expect(unitPose(u, hall, 1).facing).toBe(1);
    expect(unitPose(u, hall, -1).facing).toBe(-1);
  });
  it('does not walk in place when there is no route or live target', () => {
    const u = troop();
    u.path = [];
    expect(unitPose(u, hall).moving).toBe(false);
    hall.hp = 0;
    expect(unitPose(troop('balloon'), hall).moving).toBe(false);
    hall.hp = hall.maxHp;
  });
});
