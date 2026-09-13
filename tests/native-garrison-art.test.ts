import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/garrison/art.json';
import castle from '../reference/garrison/castle.json';
import dragon7 from '../reference/garrison/dragon7.json';
import balloon8 from '../reference/garrison/balloon8.json';
import index from './fixtures/native-garrison-mesh/index.json';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';

const worlds = { castle, dragon7, balloon8 };
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const witnesses = index.map(({ category }) =>
  JSON.parse(readFileSync(`tests/fixtures/native-garrison-mesh/${category}.json`, 'utf8')),
);
const cases = witnesses.flatMap((w) => w.cases);

it('preserves 27 source exports, all three additive scene graphs and exact catalogue dependencies', () => {
  expect(Object.keys(native.sources)).toHaveLength(10);
  expect(native.clientVersion).toBe('18.400.21');
  expect(native.reconstruction.liveIntegration).toBe(false);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
  for (const [name, sha256] of Object.entries(native.sourceCatalogSha256))
    expect(hash(readFileSync(`reference/garrison/${name}.json`))).toBe(sha256);
  for (const [family, counts] of Object.entries({
    castle: [21, 34, 28],
    dragon7: [3, 12, 50],
    balloon8: [3, 5, 11],
  })) {
    const graph = worlds[family] as NativeMeshGraph;
    expect(['exports', 'clips', 'shapes'].map((k) => Object.keys(graph[k]).length)).toEqual(counts);
    expect(new Set(Object.values(graph.clips).flatMap((c) => c.blending))).toEqual(new Set([0, 8]));
    expect(new Set(cases.filter((c) => c.family === family).map((c) => c.export))).toEqual(
      new Set(Object.keys(graph.exports)),
    );
  }
  expect(index.map((p) => p.cases)).toEqual([240, 240, 240, 240, 76, 163, 181]);
  expect(cases).toHaveLength(1380);
});

it('keeps Castle root patterns, independent treasury controls and original empty clan fields', () => {
  const graph = castle as NativeMeshGraph;
  const coinNames = [
    'CoinsBackFull',
    'CoinsBackHalf',
    'CoinsFrontFull',
    'CoinsFrontHalf',
    'CoinsRoofFull',
    'CoinsRoofHalf',
  ];
  const disabled = Object.fromEntries(coinNames.map((n) => [n, false])) as Record<string, false>;
  for (let level = 1; level <= 14; level++) {
    const name = `alliance_castle_lvl${level}`;
    const root = graph.clips[graph.exports[name]];
    expect([root.fps, root.timeline.length, root.frames.length]).toEqual([24, 94, 73]);
    expect(root.names).toEqual(expect.arrayContaining([...coinNames, 'badge', 'alliance_name']));
    const covered = cases.filter((c) => c.export === name && c.category === 'root-pattern');
    expect(new Set(covered.map((c) => root.timeline[c.frame]))).toEqual(new Set(root.timeline));
    expect(covered.some((c) => c.frame === 93)).toBe(true);
    const empty = nativeScenePoses(graph, name, 0, disabled);
    expect(nativeScenePoses(graph, name, 0).length).toBeGreaterThan(empty.length);
    expect(
      nativeScenePoses(graph, name, 0, { ...disabled, badge: false, alliance_name: false }),
    ).toEqual(empty);
  }
  expect(castle.emptyTextBounds['1273']).toMatchObject({
    text: '',
    font: 'Helvetica',
    bounds: [-2, -2, 55, 54],
  });
  expect(castle.emptyTextBounds['1290']).toMatchObject({
    text: '',
    font: 'Supercell-Magic',
    bounds: [-2, -2, 199, 39],
  });
  expect(cases.filter((c) => c.category === 'nested-treasury-glints').map((c) => c.frame)).toEqual(
    Array.from({ length: 35 }, (_, i) => i),
  );
  expect(castle.clips['1504'].timeline).toHaveLength(35);
  expect(castle.clips['1505'].timeline).toHaveLength(35);
});

it('retains nested Dragon wing/glow animation, attack locators and every Balloon attack/death frame', () => {
  const dragon = dragon7 as NativeMeshGraph;
  expect(dragon7.emptyTextBounds['219']).toMatchObject({
    text: '',
    font: 'Times New Roman',
    bounds: [0, -2, 12, 10],
  });
  for (let view = 1; view <= 3; view++) {
    const name = `dragon7_fly1_${view}`;
    const root = dragon.clips[dragon.exports[name]];
    expect([root.fps, root.timeline.length]).toEqual([24, 1]);
    expect(root.names).toContain('attack_pivot');
    expect(nativeScenePoses(dragon, name, 0)).not.toEqual(nativeScenePoses(dragon, name, 7 / 24));
    expect(nativeScenePoses(dragon, name, 0)).toEqual(nativeScenePoses(dragon, name, 16 / 24));
    expect(nativeScenePoses(dragon, name, 7 / 24, { attack_pivot: false })).toEqual(
      nativeScenePoses(dragon, name, 7 / 24),
    );
  }
  const balloon = balloon8 as NativeMeshGraph;
  expect(balloon.clips[balloon.exports.balloon_lvl8_attack1].timeline).toHaveLength(34);
  expect(balloon.clips[balloon.exports.balloon_lvl8_die1].timeline).toHaveLength(11);
  expect(balloon.clips['68'].timeline).toHaveLength(37);
  for (const [action, length] of [
    ['idle', 37],
    ['attack', 34],
    ['die', 11],
  ] as const)
    expect(
      cases
        .filter((c) => c.family === 'balloon8' && c.category === `balloon-${action}`)
        .map((c) => c.frame),
    ).toEqual(Array.from({ length }, (_, i) => i));
  expect(nativeScenePoses(balloon, 'balloon_lvl8_idle1', 0)).not.toEqual(
    nativeScenePoses(balloon, 'balloon_lvl8_idle1', 18 / 24),
  );
});

it('keeps original polygons, blend boundaries, empty locators and every packed sampling region', async () => {
  for (const [family, original] of Object.entries(native.worlds)) {
    const packed = worlds[family];
    const graph = packed as NativeMeshGraph;
    for (const field of ['clips', 'matrices', 'colors', 'exports', 'emptyTextBounds'])
      expect(packed[field]).toEqual(original.graph[field]);
    for (const [id, commands] of Object.entries(original.graph.shapes))
      for (const [i, [texture, vertices]] of (commands as [number, number[]][]).entries()) {
        const [t, v] = graph.shapes[id][i];
        expect(t).toBe(texture);
        expect(v.length).toBe(vertices.length);
        const info = original.textures[t];
        const dx = v[2] * info.width - (vertices[2] / 65535) * info.sourceSize[0];
        const dy = v[3] * info.height - (vertices[3] / 65535) * info.sourceSize[1];
        expect(
          info.regions.some(
            (r) =>
              Math.abs(r.placement[0] - r.bounds[0] - dx) < 1e-9 &&
              Math.abs(r.placement[1] - r.bounds[1] - dy) < 1e-9,
          ),
        ).toBe(true);
        for (let j = 0; j < v.length; j += 4) {
          expect(v.slice(j, j + 2)).toEqual(vertices.slice(j, j + 2));
          expect(v[j + 2] * info.width - dx).toBeCloseTo(
            (vertices[j + 2] / 65535) * info.sourceSize[0],
            10,
          );
          expect(v[j + 3] * info.height - dy).toBeCloseTo(
            (vertices[j + 3] / 65535) * info.sourceSize[1],
            10,
          );
        }
      }
    for (const texture of Object.values(original.textures)) {
      const { data, info } = await sharp(`public/${texture.path}`)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect([info.width, info.height, hash(data)]).toEqual([
        texture.width,
        texture.height,
        texture.rgbaSha256,
      ]);
      for (const region of texture.regions) {
        const [left, top] = region.placement;
        const [x, y, right, bottom] = region.bounds;
        const width = right - x,
          height = bottom - y;
        const pixels = Buffer.alloc(width * height * 4);
        for (let row = 0; row < height; row++) {
          const start = ((top + row) * info.width + left) * 4;
          data.copy(pixels, row * width * 4, start, start + width * 4);
        }
        expect(hash(pixels)).toBe(region.rgbaSha256);
      }
    }
  }
}, 30000);

it('ships six source textures and nineteen distinct portraits with exact padded icon crops', async () => {
  const assets = [
    ...Object.values(native.worlds).flatMap((w) => Object.values(w.textures)),
    ...Object.values(native.previews),
    ...Object.values(native.icons),
  ];
  expect(assets).toHaveLength(44);
  const hashes = new Set<string>();
  for (const [key, p] of Object.entries(native.previews)) {
    const { data, info } = await sharp(`public/${p.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([p.width, p.height, p.rgbaSha256]);
    expect([p.width, p.height]).toEqual([
      (p.bounds[2] - p.bounds[0]) * 2,
      (p.bounds[3] - p.bounds[1]) * 2,
    ]);
    hashes.add(hash(data));
    let border = 0,
      opaque = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < info.width; x++) {
        const alpha = data[(y * info.width + x) * 4 + 3];
        if (x < 16 || y < 16 || x >= info.width - 16 || y >= info.height - 16)
          border = Math.max(border, alpha);
        if (alpha === 255) opaque++;
      }
    expect(border, key).toBe(0);
    expect(opaque, key).toBeGreaterThan(0);
    const icon = native.icons[key];
    expect(icon.sourcePortrait).toBe(p.path);
    const [left, top, right, bottom] = icon.crop;
    const original = await sharp(`public/${p.path}`)
      .extract({ left, top, width: right - left, height: bottom - top })
      .ensureAlpha()
      .raw()
      .toBuffer();
    const actual = await sharp(`public/${icon.path}`).ensureAlpha().raw().toBuffer();
    expect(actual.equals(original), key).toBe(true);
    expect(hash(actual)).toBe(icon.rgbaSha256);
  }
  expect(hashes.size).toBe(19);
  const files = await readdir('public/assets/garrison-native', {
    recursive: true,
    withFileTypes: true,
  });
  expect(
    files
      .filter((f) => f.isFile())
      .map((f) => `${f.parentPath}/${f.name}`.replace('public/', ''))
      .sort(),
  ).toEqual(assets.map((p) => p.path).sort());
});

it('keeps every independent source witness image and cell hash intact within canvas limits', async () => {
  for (const witness of witnesses) {
    expect(witness.width).toBeLessThanOrEqual(2400);
    expect(witness.height).toBeLessThanOrEqual(12000);
    const { data, info } = await sharp(
      `tests/fixtures/native-garrison-mesh/${witness.category}.png`,
    )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, hash(data)]).toEqual([
      witness.width,
      witness.height,
      witness.rgbaSha256,
    ]);
    for (const c of witness.cases) {
      const cell = Buffer.alloc(witness.cell * witness.cell * 4);
      for (let y = 0; y < witness.cell; y++) {
        const offset = ((c.y + y) * info.width + c.x) * 4;
        data.copy(cell, y * witness.cell * 4, offset, offset + witness.cell * 4);
      }
      expect(hash(cell)).toBe(c.rgbaSha256);
    }
  }
}, 30000);
