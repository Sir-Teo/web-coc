import { expect, it } from 'vitest';
import { darkDrillPoses, type DarkDrillArtState } from '../src/game/dark-drill-art';
import { nativeVertices } from '../src/game/native-mesh';

it('renders every original tier and state with finite native geometry', () => {
  for (let level = 1; level <= 11; level++)
    for (const state of [
      'working',
      'idle',
      'constructing',
      'upgrading',
      'ruin',
    ] as DarkDrillArtState[]) {
      const poses = darkDrillPoses(level, state, 8, 99);
      expect(poses.length).toBeGreaterThan(0);
      for (const pose of poses) {
        if ('group' in pose) throw Error('Unexpected Drill blend group');
        expect(nativeVertices(pose).every(Number.isFinite)).toBe(true);
      }
    }
});
it('animates working machinery while holding nonworking states still', () => {
  for (let level = 1; level <= 11; level++) {
    expect(darkDrillPoses(level, 'working', 8, 25)).not.toEqual(
      darkDrillPoses(level, 'working', 0, 25),
    );
    for (const state of ['idle', 'constructing', 'upgrading', 'ruin'] as DarkDrillArtState[])
      expect(darkDrillPoses(level, state, 8, 25)).toEqual(darkDrillPoses(level, state, 0, 25));
    expect(darkDrillPoses(level, 'working', 0, 0)).not.toEqual(
      darkDrillPoses(level, 'working', 0, 99),
    );
    expect(darkDrillPoses(level, 'idle', 0, 50)).toEqual(darkDrillPoses(level, 'idle', 0, 99));
  }
});
it('preserves explicit world registration and rejects unsupported source inputs', () => {
  const a = darkDrillPoses(1, 'working', 8);
  const b = darkDrillPoses(1, 'working', 8, 0, [1, 0, 30, 0, 1, -20]);
  expect(a).toHaveLength(b.length);
  for (let i = 0; i < a.length; i++) {
    const left = a[i],
      right = b[i];
    if ('group' in left || 'group' in right) throw Error('Unexpected group');
    const v = nativeVertices(left),
      w = nativeVertices(right);
    for (let j = 0; j < v.length; j += 4) {
      expect(w[j] - v[j]).toBeCloseTo(30);
      expect(w[j + 1] - v[j + 1]).toBeCloseTo(-20);
    }
  }
  expect(() => darkDrillPoses(12, 'working', 0)).toThrow();
  expect(() => darkDrillPoses(1, 'working', NaN)).toThrow();
  for (const frame of [-1, 0.5, 100, NaN])
    expect(() => darkDrillPoses(1, 'working', 0, frame)).toThrow();
});
