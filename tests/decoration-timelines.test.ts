import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import index from '../reference/decorations/timelines.json';
import catalog from '../reference/decorations/catalog.json';
import manifest from '../reference/full-client/manifest.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('pins decoration animation sources to the same client as their Shop portraits', () => {
  expect(index.bundle).toBe(catalog.bundle);
  expect(index.clientVersion).toBe(catalog.clientVersion);
  for (const [path, sha256] of Object.entries(index.sources))
    expect(manifest.files.find((file) => file.path === path)?.sha256).toBe(sha256);
  expect(Object.keys(index.decorations)).toEqual([
    'torch',
    'white-flag',
    'windmeter',
    'skull-flag',
  ]);
});

for (const [kind, entry] of Object.entries(index.decorations)) {
  it(`preserves ${kind}'s native timelines, registered exports and cropped texture pixels`, async () => {
    const bytes = await readFile(`public/${entry.path}`);
    expect(hash(bytes)).toBe(entry.sha256);
    const pack = JSON.parse(bytes.toString()) as {
      kind: string;
      base: string;
      body: string;
      scenes: { buildings: NativeMeshGraph };
    };
    const definition = catalog.decorations.find((row) => row.id === kind)!;
    expect(pack).toMatchObject({ kind, base: definition.base, body: definition.export });
    const graph = pack.scenes.buildings;
    for (const [id, clip] of Object.entries(entry.animatedClips)) {
      expect(graph.clips[id].fps).toBe(clip.fps);
      expect(graph.clips[id].timeline).toHaveLength(clip.frames);
    }
    // A one-frame root must still advance its nested animation clips.
    expect(graph.clips[graph.exports[pack.body]].timeline).toHaveLength(1);
    const poses = [0, 0.25, 0.5].map((time) =>
      JSON.stringify(nativeScenePoses(graph, pack.body, time)),
    );
    expect(new Set(poses).size).toBe(3);
    nativeScenePoses(graph, pack.body, 1000);
    expect(JSON.stringify(nativeScenePoses(graph, pack.body, 0))).toBe(poses[0]);
    for (const [path, texture] of Object.entries(entry.textures)) {
      const decoded = await sharp(await readFile(`public/${path}`))
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([decoded.info.width, decoded.info.height]).toEqual([texture.width, texture.height]);
      expect(hash(decoded.data)).toBe(texture.rgbaSha256);
    }
  });
}
