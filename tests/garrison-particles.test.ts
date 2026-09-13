import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import particles from '../reference/garrison/particles.json';
import art from '../reference/garrison/particle-art.json';
import source from '../reference/garrison/particle-art-source.json';
import index from './fixtures/native-garrison-particles-mesh/index.json';

it('resolves every garrison emitter variant to preserved original art', () => {
  const exports = new Set<string>();
  for (const rows of Object.values(particles.effects))
    for (const row of rows)
      if ('ParticleEmitter' in row) expect(particles.particles).toHaveProperty(row.ParticleEmitter);
  for (const rows of Object.values(particles.particles)) {
    let swf = '';
    for (const row of rows) {
      if ('ParticleSwf' in row) swf = row.ParticleSwf;
      expect(swf).toBe('sc/buildings.sc');
      exports.add(row.ParticleExportName);
      expect(art.exports).toHaveProperty(row.ParticleExportName);
    }
  }
  expect([...exports].sort()).toEqual(Object.keys(art.exports).sort());
  expect(exports.size).toBe(27);
  expect(Object.keys(particles.particles)).toHaveLength(14);
  expect(source.nativePlaybackVerified).toBe(false);
});

it('covers every exported and nested source clip frame with an independent pixel witness', () => {
  const cases = index.flatMap(({ category }) => {
    const page = JSON.parse(
      readFileSync(`tests/fixtures/native-garrison-particles-mesh/${category}.json`, 'utf8'),
    );
    expect(page.width * page.height).toBeLessThanOrEqual(16_000_000);
    return page.cases as { export: string; frame: number; rgbaSha256: string }[];
  });
  const roots = { ...source.graph.exports };
  const exportedIds = new Set(Object.values(roots));
  for (const id of Object.keys(source.graph.clips))
    if (!exportedIds.has(Number(id))) roots[`witness_clip_${id}`] = Number(id);
  expect(cases.length).toBe(
    Object.values(roots).reduce((count, id) => count + source.graph.clips[id].timeline.length, 0),
  );
  for (const [name, id] of Object.entries(roots)) {
    const frames = cases.filter((c) => c.export === name);
    expect(frames.map((c) => c.frame)).toEqual(source.graph.clips[id].timeline.map((_, i) => i));
    for (const frame of frames) expect(frame.rgbaSha256).toMatch(/^[a-f0-9]{64}$/);
  }
});
