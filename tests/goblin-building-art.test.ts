import { expect, it } from 'vitest';
import witness from './fixtures/native-goblin-mesh/manifest.json';
import {
  GOBLIN_BUILDING_GRAPH,
  goblinBuildingPoses,
  goblinBasePoses,
} from '../src/game/goblin-building-poses';
import { GOBLIN_BUILDING_ART } from '../src/game/goblin-building-art';
import { nativeMeshPoses, nativeVertices, type NativeMatrix } from '../src/game/native-mesh';
import { NATIVE_CAMPAIGN, goblinMap } from '../src/game/native-campaign';
import { makeNpcBuilding } from '../src/game/model';

it.each(witness.cases)('matches independent Python source poses for $export at $time', (c) => {
  const poses = nativeMeshPoses(
    GOBLIN_BUILDING_GRAPH,
    c.export,
    c.time,
    {},
    c.root as NativeMatrix,
  );
  expect(poses).toHaveLength(c.poses.length);
  for (const [i, pose] of poses.entries()) {
    expect(pose.texture).toBe(c.poses[i].texture);
    expect(pose.vertices).toEqual(c.poses[i].vertices);
    expect(pose.blend).toBe(c.poses[i].blend);
    for (const field of ['matrix', 'multiply', 'add'] as const)
      for (const [j, v] of pose[field].entries()) expect(v).toBeCloseTo(c.poses[i][field][j], 10);
  }
});

it('retains eight flag states with a one-second period and keeps the Hut static', () => {
  const frames = Array.from({ length: 24 }, (_, frame) =>
    goblinBuildingPoses('goblin-townhall', frame / 24),
  );
  expect(new Set(frames.map((v) => JSON.stringify(v))).size).toBe(8);
  for (const [frame, pose] of frames.entries())
    expect(goblinBuildingPoses('goblin-townhall', 1200 + frame / 24)).toEqual(pose);
  expect(goblinBuildingPoses('goblin-hut', 0)).toEqual(goblinBuildingPoses('goblin-hut', 1200.375));
});

it('registers the original foundation geometry to the local tile diamond without changing foreground proportions', () => {
  for (const kind of ['goblin-townhall', 'goblin-hut'] as const) {
    const { size, width, height, scale, anchorX, anchorY } = GOBLIN_BUILDING_ART[kind];
    const x: number[] = [],
      y: number[] = [];
    for (const pose of goblinBasePoses(kind)) {
      const v = nativeVertices(pose);
      for (let i = 0; i < v.length; i += 4) {
        x.push(v[i]);
        y.push(v[i + 1]);
      }
    }
    expect(Math.min(...x)).toBeCloseTo(-size * 32, 4);
    expect(Math.max(...x)).toBeCloseTo(size * 32, 4);
    expect(Math.min(...y)).toBeCloseTo(-size * 16, 4);
    expect(Math.max(...y)).toBeCloseTo(size * 16, 4);
    expect(width / height).toBeCloseTo(kind === 'goblin-townhall' ? 400 / 360 : 280 / 260);
    expect(goblinBuildingPoses(kind, 0)).toEqual(
      nativeMeshPoses(GOBLIN_BUILDING_GRAPH, GOBLIN_BUILDING_ART[kind].export, 0, {}, [
        scale,
        0,
        -scale * anchorX,
        0,
        scale,
        -scale * anchorY,
      ]),
    );
  }
});

it('covers every Goblin map Town Hall level while refusing the first weapon-bearing Hall', () => {
  let count = 0,
    highest = 0;
  // Goblin Halls belong to the Goblin map; a Challenge village is an ordinary Home Village.
  for (const stage of NATIVE_CAMPAIGN.filter(goblinMap))
    for (const [id, x, y, level] of stage.buildings)
      if (id === 1000001) {
        const b = makeNpcBuilding(1000, 'goblin-townhall', x + 2, y + 2, level);
        expect(b.hp).toBe(b.maxHp);
        expect(b.level).toBe(level);
        count++;
        highest = Math.max(highest, level);
      }
  expect(count).toBe(71);
  expect(highest).toBe(11);
  expect(() => makeNpcBuilding(1000, 'goblin-townhall', 10, 10, 12)).toThrow();
});
