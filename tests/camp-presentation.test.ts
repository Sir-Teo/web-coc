import { describe, it, expect } from 'vitest';
import { campPlan, campPose, MAX_CAMP_ACTORS } from '../src/game/camp-presentation';
import { emptyArmy } from '../src/game/army';
import { makeBuilding } from '../src/game/model';
import { BUILDINGS, TROOP_KEYS, TROOPS } from '../src/game/data';

describe('camp occupants', () => {
  it('shows actual individual troops, not their housing or a fixed set of kinds', () => {
    const army = { ...emptyArmy(), giant: 1, goblin: 3, wallbreaker: 2, balloon: 1 };
    const original = structuredClone(army);
    const actors = campPlan(army, [makeBuilding(1, 'camp', 10, 10)]);
    expect(actors).toHaveLength(7);
    expect(actors.filter((a) => a.kind === 'giant')).toHaveLength(1);
    expect(actors.filter((a) => a.kind === 'goblin')).toHaveLength(3);
    expect(actors.some((a) => a.kind === 'archer')).toBe(false);
    expect(new Set(actors.map((a) => a.id)).size).toBe(actors.length);
    expect(army).toEqual(original);
  });

  it('distributes housing across all completed camps in proportion to their level', () => {
    const buildings = [
      makeBuilding(1, 'camp', 3, 3, 1),
      makeBuilding(2, 'camp', 19, 3, 2),
      makeBuilding(3, 'camp', 3, 19, 1),
      makeBuilding(4, 'camp', 19, 19, 2),
    ];
    const actors = campPlan({ ...emptyArmy(), archer: 60 }, buildings);
    const load = buildings.map((b) =>
      actors.filter((a) => a.campId === b.id).reduce((n, a) => n + TROOPS[a.kind].space, 0),
    );
    expect(load).toEqual([10, 20, 10, 20]);
    buildings[1].constructing = true;
    expect(campPlan({ ...emptyArmy(), archer: 60 }, buildings).some((a) => a.campId === 2)).toBe(
      false,
    );
  });

  it('keeps every supported maximum-size army visible and bounds oversized imports', () => {
    const camp = [makeBuilding(1, 'camp', 10, 10, 8)];
    expect(campPlan({ ...emptyArmy(), swordsman: 660 }, camp)).toHaveLength(660);
    const huge = Object.fromEntries(TROOP_KEYS.map((k) => [k, 9999])) as ReturnType<
      typeof emptyArmy
    >;
    const actors = campPlan(huge, camp);
    expect(actors).toHaveLength(MAX_CAMP_ACTORS);
    expect(new Set(actors.map((a) => a.kind)).size).toBe(TROOP_KEYS.length);
  });

  it('does not show occupants without completed camps or without an army', () => {
    const camp = makeBuilding(1, 'camp', 10, 10);
    expect(campPlan(emptyArmy(), [camp])).toEqual([]);
    camp.constructing = true;
    expect(campPlan({ ...emptyArmy(), giant: 1 }, [camp])).toEqual([]);
    expect(campPlan({ ...emptyArmy(), giant: 1 }, [])).toEqual([]);
  });

  it('keeps complete walking segments outside buildings and walls, including at map edges', () => {
    const buildings = [
      makeBuilding(1, 'camp', 2, 2),
      makeBuilding(2, 'camp', 23, 23),
      makeBuilding(3, 'goldstorage', 5, 2),
      makeBuilding(4, 'barracks', 20, 23),
      ...Array.from({ length: 5 }, (_, i) => makeBuilding(10 + i, 'wall', 2 + i, 6)),
    ];
    const actors = campPlan({ ...emptyArmy(), goblin: 80 }, buildings);
    for (const actor of actors)
      for (let time = 0; time < 20; time += 0.11) {
        const pose = campPose(actor, time);
        expect(pose.x).toBeGreaterThan(1);
        expect(pose.y).toBeGreaterThan(1);
        expect(pose.x).toBeLessThan(27);
        expect(pose.y).toBeLessThan(27);
        expect(
          buildings.some(
            (b) =>
              pose.x >= b.x &&
              pose.x < b.x + BUILDINGS[b.kind].size &&
              pose.y >= b.y &&
              pose.y < b.y + BUILDINGS[b.kind].size,
          ),
        ).toBe(false);
      }
  });

  it('produces deterministic poses with pauses and reanchors a moved camp', () => {
    const camp = makeBuilding(1, 'camp', 3, 3);
    const army = { ...emptyArmy(), goblin: 1 };
    const first = campPlan(army, [camp])[0];
    const moving = Array.from({ length: 100 }, (_, i) => campPose(first, i * 0.1).moving);
    expect(moving).toContain(true);
    expect(moving).toContain(false);
    camp.x = camp.y = 20;
    const moved = campPlan(army, [camp])[0];
    expect(moved.id).toBe(first.id);
    expect(campPose(moved, 1).x).toBeGreaterThan(16);
    expect(campPose(moved, 1).y).toBeGreaterThan(16);
  });
});
