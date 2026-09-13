import { expect, it } from 'vitest';
import graph from '../reference/shrink-trap/runtime.json';
import effects from '../reference/shrink-trap/effects.json';
import { nativeParticleSampler } from '../src/game/native-particles';
import {
  nativeVertices,
  type NativeMeshGraph,
  type NativeScenePose,
} from '../src/game/native-mesh';

it('can fit a long animated child to particle life without changing static-outer timing for existing callers', () => {
  const raw = graph as unknown as NativeMeshGraph;
  const outer = raw.clips[raw.exports.shrink_range];
  const inner = raw.clips[outer.children[0]];
  expect(outer.timeline).toHaveLength(1);
  expect(inner.timeline).toHaveLength(685);
  const rows = effects.particles.Shrink_deploy_range;
  const width = (poses: NativeScenePose[]): number => {
    const xs: number[] = [];
    const walk = (items: NativeScenePose[]) => {
      for (const p of items) {
        if ('group' in p) walk(p.group);
        else xs.push(...nativeVertices(p).filter((_, i) => i % 4 === 0));
      }
    };
    walk(poses);
    return Math.max(...xs) - Math.min(...xs);
  };
  const args = [
    'ring',
    'Shrink_deploy_range',
    rows,
    4,
    { x: 0, y: 0 },
    () => 0.5,
    'Ground',
    false,
  ] as const;
  const legacy = nativeParticleSampler(raw, 1)(...args)!;
  const nested = nativeParticleSampler(raw, 1, {
    timelineDurations: { shrink_range: inner.timeline.length / inner.fps },
  })(...args)!;
  expect(width(legacy.poses)).toBeLessThan(20);
  expect(width(nested.poses)).toBeGreaterThan(300);
  expect([legacy.x, legacy.y, legacy.depth]).toEqual([nested.x, nested.y, nested.depth]);
});
