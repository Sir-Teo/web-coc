import { it, expect } from 'vitest';
import { TESLA_ART, TESLA_ART_LEVELS, teslaAsset, teslaTexture } from '../src/game/tesla-art';
import { asset, buildingTexture } from '../src/game/data';
import { TESLA_GRAPH, teslaPoses, teslaBodyBounds } from '../src/game/tesla-poses';
import { nativeScenePoses, type NativeScenePose } from '../src/game/native-mesh';
import runtime from '../reference/tesla/runtime.json';

const registration = [1.2, 0, 0, 0, 1.2, -48] as const;

it('uses all 17 native portraits with the same world registration as their source meshes', () => {
  expect(TESLA_ART_LEVELS).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
  expect(TESLA_ART.width / 320).toBe(TESLA_ART.height / 380);
  expect(TESLA_ART.width / 320).toBe(TESLA_ART.scale / 2);
  expect(TESLA_ART.originY * TESLA_ART.height).toBe(150);
  for (const level of TESLA_ART_LEVELS) {
    expect(asset('tesla', level)).toBe(`/assets/buildings/tesla-native/preview-${level}.png`);
    expect(asset('tesla', level)).toBe(teslaAsset(level));
    expect(buildingTexture('tesla', level)).toBe(teslaTexture(level));
  }
});

it.each(TESLA_ART_LEVELS)(
  'plays level %i trapdoors once and holds the raised body through idle loops and seeks',
  (level) => {
    const row = runtime.levels[level - 1];
    const root = TESLA_GRAPH.exports[row.ExportNameTriggered];
    const idle = TESLA_GRAPH.clips[root].names.indexOf('idle_electricity');
    const body = (poses: NativeScenePose[]) =>
      poses.filter((p) => !p.key.startsWith(`${root}/${idle}`));
    const sample = (frame: number, idle: number | false) =>
      nativeScenePoses(
        TESLA_GRAPH,
        row.ExportNameTriggered,
        frame / 24,
        { idle_electricity: idle },
        [...registration],
      );
    expect(teslaPoses(level, 'reveal', 0)).toEqual([]);
    expect(teslaPoses(level, 'reveal', 4 / 24)).toEqual(sample(4, 0));
    const held = sample(17, false);
    expect(held.length).toBeGreaterThan(0);
    for (const frame of [17, 18, 22, 42, 199, 7200, 24000, 22, 0]) {
      expect(teslaPoses(level, 'reveal', frame / 24)).toEqual(
        sample(Math.min(17, frame), Math.max(0, frame - 17)),
      );
      // Removing the named electricity control establishes that the structural root
      // is held, even at the original loop boundary and after a backward seek.
      if (frame >= 17) expect(body(teslaPoses(level, 'reveal', frame / 24))).toEqual(body(held));
    }
    expect(teslaPoses(level, 'reveal', 0, true)).toEqual(held);
    expect(teslaPoses(level, 'reveal', 42, true)).toEqual(held);
  },
);

it('uses native construction, upgrade scaffolds and a fixed damaged variant with finite picking bounds', () => {
  const row = runtime.levels[0];
  const sample = (name: string) => nativeScenePoses(TESLA_GRAPH, name, 0, {}, [...registration]);
  expect(teslaPoses(1, 'constructing', 42)).toEqual(sample(row.ExportNameConstruction));
  expect(teslaPoses(1, 'upgrading', 42)).toEqual([
    ...teslaPoses(1, 'setup', 0, true),
    ...sample(row.ExportNameBuildAnim),
  ]);
  expect(teslaPoses(1, 'ruin', 42)).toEqual(sample(row.ExportNameDamaged));
  expect(teslaPoses(17, 'ruin', 0)).toEqual(teslaPoses(17, 'ruin', 99));
  for (const state of ['setup', 'constructing', 'upgrading', 'ruin'] as const) {
    const [left, top, right, bottom] = teslaBodyBounds(17, state);
    expect([left, top, right, bottom].every(Number.isFinite)).toBe(true);
    expect(left).toBeLessThan(right);
    expect(top).toBeLessThan(bottom);
  }
  expect(teslaBodyBounds(17, 'constructing')[1]).toBeGreaterThan(teslaBodyBounds(17)[1]);
  expect(() => teslaPoses(18, 'setup', 0)).toThrow('Unsupported native Tesla level');
});
