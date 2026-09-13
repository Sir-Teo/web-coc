import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import raw from '../reference/inferno/multiply-runtime.json';
import source from '../reference/inferno/multiply-source.json';
import index from './fixtures/native-inferno-multiply/index.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

it('retains original Multiply slots and closes both level-one model cycles at 100 frames', () => {
  const graph = raw as unknown as NativeMeshGraph;
  expect(Object.keys(raw.exports).sort()).toEqual([
    'dark_tower_base',
    'dark_tower_lvl1',
    'dark_tower_lvl1_multi',
  ]);
  expect(Object.values(raw.clips).filter((c) => c.blending.includes(3))).toHaveLength(2);
  for (const name of ['dark_tower_lvl1', 'dark_tower_lvl1_multi'])
    expect(nativeScenePoses(graph, name, 100 / 24)).toEqual(nativeScenePoses(graph, name, 0));
  expect(source.nativePlaybackVerified).toBe(false);
});
it('covers both combined cycles and every original nested clip frame', () => {
  const cases = index.flatMap(
    ({ category }) =>
      JSON.parse(readFileSync(`tests/fixtures/native-inferno-multiply/${category}.json`, 'utf8'))
        .cases,
  ) as { export: string; frame: number }[];
  expect(cases).toHaveLength(321);
  for (const name of ['dark_tower_lvl1', 'dark_tower_lvl1_multi'])
    expect(cases.filter((c) => c.export === name).map((c) => c.frame)).toEqual(
      Array.from({ length: 100 }, (_, i) => i),
    );
  for (const [id, clip] of Object.entries(raw.clips))
    expect(cases.filter((c) => c.export === `witness_clip_${id}`).map((c) => c.frame)).toEqual(
      clip.timeline.map((_, i) => i),
    );
});
