import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import raw from '../reference/inferno/art-runtime.json';
import source from '../reference/inferno/art-source.json';
import definition from '../reference/inferno/native.json';
import catalog from '../reference/inferno/catalog.json';
import {
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeScenePose,
} from '../src/game/native-mesh';

it('retains every original Inferno tier, building state and effect export', () => {
  expect(raw.exports).toEqual(definition.artInventory.exports);
  expect(Object.keys(raw.exports)).toHaveLength(91);
  expect(Object.keys(raw.clips)).toHaveLength(134);
  expect(Object.keys(raw.shapes)).toHaveLength(219);
  expect(source.definitionSha256).toBe(
    createHash('sha256').update(readFileSync('reference/inferno/native.json')).digest('hex'),
  );
  const exports = raw.exports as Record<string, number>;
  for (const level of catalog.levels)
    for (const [field, name] of Object.entries(level.art))
      if (field !== 'SWF') expect(exports[name], `${level.level} ${field}`).toBeTypeOf('number');
  expect(raw.clips).toEqual(source.graph.clips);
  expect(raw.matrices).toEqual(source.graph.matrices);
  expect(raw.colors).toEqual(source.graph.colors);
  expect(Object.values(raw.clips).filter((c) => c.blending.includes(3))).toHaveLength(22);
  expect(source.nativePlaybackVerified).toBe(false);
});

it('preserves source geometry while remapping texture coordinates', () => {
  for (const [id, commands] of Object.entries(raw.shapes)) {
    const original = (source.graph.shapes as Record<string, [number, number[]][]>)[id];
    expect(commands).toHaveLength(original.length);
    for (let c = 0; c < commands.length; c++) {
      const [texture, vertices] = commands[c] as [number, number[]];
      expect(texture).toBe(original[c][0]);
      expect(vertices).toHaveLength(original[c][1].length);
      for (let i = 0; i < vertices.length; i += 4) {
        expect(vertices.slice(i, i + 2)).toEqual(original[c][1].slice(i, i + 2));
        expect(vertices[i + 2]).toBeGreaterThanOrEqual(0);
        expect(vertices[i + 2]).toBeLessThanOrEqual(1);
        expect(vertices[i + 3]).toBeGreaterThanOrEqual(0);
        expect(vertices[i + 3]).toBeLessThanOrEqual(1);
      }
    }
  }
});

it('samples every retained clip frame with finite geometry and supported isolated blends', () => {
  const graph = { ...raw, exports: { ...raw.exports } } as unknown as NativeMeshGraph;
  const check = (poses: NativeScenePose[]) => {
    for (const pose of poses) {
      expect([...pose.multiply, ...pose.add].every(Number.isFinite)).toBe(true);
      if ('group' in pose) {
        expect([3, 4, 8]).toContain(pose.blend);
        check(pose.group);
      } else {
        expect([...pose.vertices, ...pose.matrix].every(Number.isFinite)).toBe(true);
        expect(graph.textures[pose.texture]).toBeDefined();
      }
    }
  };
  for (const [id, clip] of Object.entries(graph.clips)) {
    graph.exports.witness = Number(id);
    for (let frame = 0; frame < clip.timeline.length; frame++)
      check(nativeScenePoses(graph, 'witness', frame / clip.fps));
  }
});

it('covers every original export and all retained clip frames with independent pixel witnesses', () => {
  const index = JSON.parse(
    readFileSync('tests/fixtures/native-inferno-art/index.json', 'utf8'),
  ) as { category: string; cases: number }[];
  const cases = index.flatMap(({ category, cases: count }) => {
    const page = JSON.parse(
      readFileSync(`tests/fixtures/native-inferno-art/${category}.json`, 'utf8'),
    );
    expect(page.cases).toHaveLength(count);
    expect(page.nativePlaybackVerified).toBe(false);
    return page.cases as { export: string; frame: number; rgbaSha256: string }[];
  });
  expect(cases).toHaveLength(2332);
  for (const name of Object.keys(raw.exports))
    expect(cases.filter((c) => c.export === name).map((c) => c.frame)).toEqual([0]);
  for (const [id, clip] of Object.entries(raw.clips))
    expect(cases.filter((c) => c.export === `witness_clip_${id}`).map((c) => c.frame)).toEqual(
      clip.timeline.map((_, i) => i),
    );
  expect(cases.every((c) => /^[a-f0-9]{64}$/.test(c.rgbaSha256))).toBe(true);
});
