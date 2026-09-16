import { expect, it } from 'vitest';
import { type InfernoArtState } from '../src/game/inferno-art';
import { infernoPoses, INFERNO_GRAPH } from '../src/game/inferno-graph';
import { nativeScenePoses, type NativeScenePose } from '../src/game/native-mesh';
import { infernoStats } from '../src/game/inferno-weapon';
const leaves = (poses: NativeScenePose[]): number =>
  poses.reduce((n, p) => n + ('group' in p ? leaves(p.group) : 1), 0);

it('uses all source tier/mode/state exports without fallback', () => {
  for (let level = 1; level <= 12; level++)
    for (const mode of ['single', 'multi'] as const)
      for (const state of [
        'active',
        'empty',
        'constructing',
        'upgrading',
        'ruin',
      ] as InfernoArtState[]) {
        const poses = infernoPoses(level, mode, state, 0.5);
        expect(leaves(poses), `${level} ${mode} ${state}`).toBeGreaterThan(0);
        expect(infernoPoses(level, mode, state, 0.5)).toEqual(poses);
      }
});

it('hides the original named ammo layer rather than inventing a depleted texture', () => {
  for (let level = 1; level <= 12; level++)
    for (const mode of ['single', 'multi'] as const) {
      const { art } = infernoStats(level);
      const body = mode === 'single' ? art.ExportName : art.AlternateExportName;
      const expected = [
        ...nativeScenePoses(INFERNO_GRAPH, art.ExportNameBase, 0.5),
        ...nativeScenePoses(INFERNO_GRAPH, body, 0.5, { ammo: false }),
      ];
      expect(infernoPoses(level, mode, 'empty', 0.5)).toEqual(expected);
      expect(leaves(expected)).toBeLessThan(leaves(infernoPoses(level, mode, 'active', 0.5)));
    }
});

it('keeps the original ruin independent of weapon mode and preserves supplied registration', () => {
  const root = [1.2, 0, 10, 0, 1.2, -64] as [number, number, number, number, number, number];
  for (let level = 1; level <= 12; level++) {
    const { art } = infernoStats(level);
    const expected = nativeScenePoses(INFERNO_GRAPH, art.ExportNameDamaged, 0, {}, root);
    expect(infernoPoses(level, 'single', 'ruin', 0, root)).toEqual(expected);
    expect(infernoPoses(level, 'multi', 'ruin', 0, root)).toEqual(expected);
  }
  expect(() => infernoPoses(13, 'single', 'active', 0)).toThrow();
  expect(() => infernoPoses(1, 'single', 'active', NaN)).toThrow();
});
