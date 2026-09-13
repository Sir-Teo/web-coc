import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
const read = (name: string) =>
  JSON.parse(readFileSync(`reference/archer-tower/${name}.json`, 'utf8'));
for (const name of ['buildings', 'characters']) {
  it(`preserves original ${name} geometry, timelines and graph inventory`, () => {
    const runtime = read(`${name}-runtime`),
      source = read(`${name}-source`),
      inventory = read('art-inventory').scenes[`sc/${name}.sc`];
    expect(source.definitionSha256).toBe(
      createHash('sha256').update(readFileSync('reference/archer-tower/native.json')).digest('hex'),
    );
    expect(source.inventorySha256).toBe(
      createHash('sha256')
        .update(readFileSync('reference/archer-tower/art-inventory.json'))
        .digest('hex'),
    );
    expect(runtime.exports).toEqual(inventory.exports);
    expect(runtime.clips).toEqual(source.graph.clips);
    expect(runtime.matrices).toEqual(source.graph.matrices);
    expect(runtime.colors).toEqual(source.graph.colors);
    for (const [id, commands] of Object.entries(runtime.shapes) as [
      string,
      [number, number[]][],
    ][]) {
      const original = source.graph.shapes[id];
      expect(commands.length).toBe(original.length);
      for (const [index, [texture, vertices]] of commands.entries()) {
        expect(texture).toBe(original[index][0]);
        for (let i = 0; i < vertices.length; i += 4) {
          expect(vertices.slice(i, i + 2)).toEqual(original[index][1].slice(i, i + 2));
          expect(vertices.slice(i + 2, i + 4).every((v) => v >= 0 && v <= 1)).toBe(true);
        }
      }
    }
    const graph = runtime as NativeMeshGraph;
    let count = 0;
    for (const [id, clip] of Object.entries(graph.clips)) {
      graph.exports.witness = Number(id);
      for (let frame = 0; frame < clip.timeline.length; frame++) {
        const pending = [...nativeScenePoses(graph, 'witness', frame / clip.fps)];
        while (pending.length) {
          const pose = pending.pop()!;
          if ('group' in pose) {
            expect(pose.blend).toBe(8);
            expect([...pose.multiply, ...pose.add].every(Number.isFinite)).toBe(true);
            pending.push(...pose.group);
            continue;
          }
          expect(
            [...pose.vertices, ...pose.matrix, ...pose.multiply, ...pose.add].every(
              Number.isFinite,
            ),
          ).toBe(true);
          expect(graph.textures[pose.texture]).toBeDefined();
        }
        count++;
      }
    }
    expect(count).toBe(name === 'buildings' ? 6078 : 15);
  });
}
