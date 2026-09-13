import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
const source = JSON.parse(readFileSync('reference/archer-tower/defenders-source.json', 'utf8'));
const graph = JSON.parse(
  readFileSync('reference/archer-tower/defenders-runtime.json', 'utf8'),
) as NativeMeshGraph;
it('preserves all rooftop Archer tier bindings and source animation timing records', () => {
  expect(source.definitionSha256).toBe(
    createHash('sha256').update(readFileSync('reference/archer-tower/native.json')).digest('hex'),
  );
  expect(source.levels).toHaveLength(21);
  expect(Object.keys(source.animations)).toHaveLength(9);
  expect(Object.keys(graph.exports)).toHaveLength(54);
  expect(source.levels[14].DefenderCharacter).toBe('Archer7');
  for (const level of source.levels) {
    const block = source.animations[level.DefenderCharacter];
    for (const state of ['idle', 'attack']) {
      const row = block.rows.find((r: Record<string, string>) => r.Name === state);
      expect(row.HasDirections).toBe('TRUE');
      if (state === 'attack') expect(row.ActionFrame).toBe('5');
      for (const direction of [1, 2, 3])
        expect(graph.exports[`${row.ExportName}_${direction}`]).toBeTypeOf('number');
    }
  }
  expect(graph.clips).toEqual(source.graph.clips);
  expect(graph.matrices).toEqual(source.graph.matrices);
  expect(graph.colors).toEqual(source.graph.colors);
});
it('samples every captured resident Archer frame including original blend groups', () => {
  let frames = 0;
  for (const [id, clip] of Object.entries(graph.clips)) {
    graph.exports.witness = Number(id);
    for (let frame = 0; frame < clip.timeline.length; frame++) {
      const pending = [...nativeScenePoses(graph, 'witness', frame / clip.fps)];
      while (pending.length) {
        const pose = pending.pop()!;
        expect([...pose.multiply, ...pose.add].every(Number.isFinite)).toBe(true);
        if ('group' in pose) {
          expect(pose.blend).toBe(8);
          pending.push(...pose.group);
        } else {
          expect([...pose.vertices, ...pose.matrix].every(Number.isFinite)).toBe(true);
          expect(graph.textures[pose.texture]).toBeDefined();
        }
      }
      frames++;
    }
  }
  expect(frames).toBe(2654);
});
