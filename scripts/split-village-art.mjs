/**
 * Per-level village packs: one small pack for each level of each native building family.
 *
 * A family pack (public/assets/village-native/<kind>/graph.json) draws every level from shared
 * atlases, so a village with one Level 2 Town Hall downloads, decodes and uploads the whole
 * 3002×3066 Town Hall atlas, about 37 MB of GPU memory, to draw the 4% of it that level uses.
 * This script writes, for every level row, a pack holding only the clips and shapes its idle
 * exports (ExportName and ExportNameBase) reach, and atlases holding only the source pixels those
 * shapes sample:
 *
 *   public/assets/village-levels/<kind>/<level>.json
 *   public/assets/village-levels/<kind>/<level>-<scene>-<page>.png
 *   reference/full-client/village-levels.json   (which levels have one)
 *
 * Construction, upgrade, damaged and trap exports stay in the family pack, which the village
 * loads when a building first shows one of them. A level gets a pack only when it needs at most
 * half of its family's texels. Levels whose idle body is a Spell Tower mode or a Town Hall
 * weapon, and families with variant packs, keep their family packs.
 *
 * Each shape's source rectangle is copied with a two-texel border of its original neighbors, so
 * bilinear sampling (the atlases have no mipmaps) reads exactly the texels it read before.
 * Overlapping rectangles merge first. Texture coordinates move by whole texels, so every sample
 * lands on the same source texel. Clip timelines are kept; matrices and colors are reduced to the
 * ones those clips use and renumbered.
 *
 *   node scripts/split-village-art.mjs           # write
 *   node scripts/split-village-art.mjs --check   # compare graphs and decoded pixels
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const OUT = 'assets/village-levels';
const PAD = 2;
const FIELDS = ['ExportName', 'ExportNameBase'];
/** A level pack must need no more than this share of its family's texels. */
const WORTH = 0.5;
const MAX_PAGE = 4096;
const check = process.argv.includes('--check');
const index = JSON.parse(
  await fs.readFile(path.join(ROOT, 'reference/full-client/village-art.json'), 'utf8'),
).buildings;

/** Clip and shape ids an export reaches. */
function reach(graph, exportName) {
  const clips = new Set(),
    shapes = new Set();
  const stack = [graph.exports[exportName]];
  while (stack.length) {
    const id = String(stack.pop());
    if (graph.shapes[id]) shapes.add(id);
    const clip = graph.clips[id];
    if (clip && !clips.has(id)) {
      clips.add(id);
      stack.push(...clip.children);
    }
  }
  return { clips, shapes };
}

const sources = new Map();
async function source(texture) {
  let pending = sources.get(texture.path);
  if (!pending) {
    pending = sharp(path.join(PUBLIC, texture.path))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
      .then(({ data, info }) => {
        if (info.width !== texture.width || info.height !== texture.height)
          throw Error(`${texture.path} is ${info.width}×${info.height}, not as declared`);
        return data;
      });
    sources.set(texture.path, pending);
  }
  return pending;
}

/** Texel rectangle a shape entry samples, with its border, clamped to the atlas. */
function rectOf(vertices, texture) {
  let u0 = Infinity,
    v0 = Infinity,
    u1 = -Infinity,
    v1 = -Infinity;
  for (let i = 0; i < vertices.length; i += 4) {
    u0 = Math.min(u0, vertices[i + 2]);
    u1 = Math.max(u1, vertices[i + 2]);
    v0 = Math.min(v0, vertices[i + 3]);
    v1 = Math.max(v1, vertices[i + 3]);
  }
  const x0 = Math.max(0, Math.floor(u0 * texture.width) - PAD);
  const y0 = Math.max(0, Math.floor(v0 * texture.height) - PAD);
  const x1 = Math.min(texture.width, Math.ceil(u1 * texture.width) + PAD);
  const y1 = Math.min(texture.height, Math.ceil(v1 * texture.height) + PAD);
  return { x0, y0, x1, y1 };
}
const overlaps = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
/** Merge intersecting rectangles until none intersect. */
function merge(rects) {
  const out = [];
  for (const rect of rects) {
    let r = { ...rect };
    for (let i = 0; i < out.length;) {
      if (overlaps(r, out[i])) {
        const o = out.splice(i, 1)[0];
        r = {
          x0: Math.min(r.x0, o.x0),
          y0: Math.min(r.y0, o.y0),
          x1: Math.max(r.x1, o.x1),
          y1: Math.max(r.y1, o.y1),
        };
        i = 0;
      } else i++;
    }
    out.push(r);
  }
  return out;
}
/** Shelf packing, tallest first, into pages no larger than MAX_PAGE on a side. */
function pack(rects) {
  const items = rects
    .map((r) => {
      // A side on the atlas edge gets a border of repeated edge texels, standing in for the
      // clamp-to-edge sampling the atlas had there.
      const ox = r.x0 === 0 ? PAD : 0,
        oy = r.y0 === 0 ? PAD : 0;
      const w = r.x1 - r.x0 + ox + (r.x1 === r.W ? PAD : 0),
        h = r.y1 - r.y0 + oy + (r.y1 === r.H ? PAD : 0);
      return { ...r, ox, oy, w, h };
    })
    .sort((a, b) => b.h - a.h || b.w - a.w || a.y0 - b.y0 || a.x0 - b.x0);
  const area = items.reduce((n, r) => n + r.w * r.h, 0);
  const width = Math.min(
    MAX_PAGE,
    Math.max(...items.map((r) => r.w), Math.ceil(Math.sqrt(area) * 1.15)),
  );
  const pages = [];
  let page = null,
    x = 0,
    y = 0,
    shelf = 0;
  for (const item of items) {
    if (!page || x + item.w > width) {
      y += shelf;
      x = 0;
      shelf = 0;
    }
    if (!page || y + item.h > MAX_PAGE) {
      page = { width: 0, height: 0, items: [] };
      pages.push(page);
      x = y = shelf = 0;
    }
    item.page = pages.length - 1;
    item.dx = x;
    item.dy = y;
    page.items.push(item);
    page.width = Math.max(page.width, x + item.w);
    page.height = Math.max(page.height, y + item.h);
    x += item.w;
    shelf = Math.max(shelf, item.h);
  }
  return pages;
}

async function splitLevel(kind, family, row) {
  const scenes = {};
  const files = new Map();
  const byScene = new Map();
  for (const field of FIELDS) {
    const ref = row.refs[field];
    if (!ref) continue;
    const graph = family.scenes[ref.scene];
    if (!graph || graph.exports[ref.export] === undefined) continue;
    let entry = byScene.get(ref.scene);
    if (!entry) byScene.set(ref.scene, (entry = { exports: new Set() }));
    entry.exports.add(ref.export);
  }
  for (const [name, { exports }] of [...byScene].sort(([a], [b]) => a.localeCompare(b))) {
    const graph = family.scenes[name];
    const clips = new Set(),
      shapes = new Set();
    for (const exportName of exports) {
      const reached = reach(graph, exportName);
      for (const id of reached.clips) clips.add(id);
      for (const id of reached.shapes) shapes.add(id);
    }
    const shapeIds = [...shapes].sort((a, b) => Number(a) - Number(b));
    // Rectangles per source texture, merged, then packed together.
    const rects = [];
    const bySource = new Map();
    for (const id of shapeIds)
      for (const [texture, vertices] of graph.shapes[id]) {
        const key = String(texture);
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key).push(rectOf(vertices, graph.textures[key]));
      }
    for (const [texture, list] of [...bySource].sort(([a], [b]) => Number(a) - Number(b)))
      for (const rect of merge(list))
        rects.push({
          ...rect,
          texture,
          W: graph.textures[texture].width,
          H: graph.textures[texture].height,
        });
    const pages = pack(rects);
    const placed = pages.flatMap((p) => p.items);
    const locate = (texture, rect) =>
      placed.find(
        (p) =>
          p.texture === texture &&
          p.x0 <= rect.x0 &&
          p.y0 <= rect.y0 &&
          p.x1 >= rect.x1 &&
          p.y1 >= rect.y1,
      );
    const textures = {};
    for (const [i, page] of pages.entries()) {
      const file = `${OUT}/${kind}/${row.level}-${name}-${i}.png`;
      const pixels = Buffer.alloc(page.width * page.height * 4);
      for (const item of page.items) {
        const src = graph.textures[item.texture];
        const data = await source(src);
        const clamp = (v, size) => Math.min(size - 1, Math.max(0, v));
        for (let y = 0; y < item.h; y++) {
          const sy = clamp(item.y0 - item.oy + y, src.height);
          for (let x = 0; x < item.w;) {
            const sx = item.x0 - item.ox + x;
            const to = ((item.dy + y) * page.width + item.dx + x) * 4;
            if (sx < 0 || sx >= src.width) {
              data.copy(
                pixels,
                to,
                (sy * src.width + clamp(sx, src.width)) * 4,
                (sy * src.width + clamp(sx, src.width)) * 4 + 4,
              );
              x++;
            } else {
              const run = Math.min(item.w - x, src.width - sx);
              data.copy(pixels, to, (sy * src.width + sx) * 4, (sy * src.width + sx + run) * 4);
              x += run;
            }
          }
        }
      }
      textures[i] = { path: file, width: page.width, height: page.height };
      files.set(file, { pixels, width: page.width, height: page.height });
    }
    const outShapes = {};
    for (const id of shapeIds)
      outShapes[id] = graph.shapes[id].map(([texture, vertices]) => {
        const key = String(texture);
        const src = graph.textures[key];
        const item = locate(key, rectOf(vertices, src));
        const page = pages[item.page];
        const moved = vertices.slice();
        for (let i = 0; i < moved.length; i += 4) {
          moved[i + 2] = (moved[i + 2] * src.width - item.x0 + item.ox + item.dx) / page.width;
          moved[i + 3] = (moved[i + 3] * src.height - item.y0 + item.oy + item.dy) / page.height;
        }
        return [item.page, moved];
      });
    // Keep only the matrices and colors these clips place, renumbered in first-use order.
    const matrices = [],
      colors = [],
      matrixIndex = new Map(),
      colorIndex = new Map();
    const renumber = (index, list, from, i) => {
      if (!index.has(i)) {
        index.set(i, list.length);
        list.push(from[i]);
      }
      return index.get(i);
    };
    const outClips = {};
    for (const id of [...clips].sort((a, b) => Number(a) - Number(b))) {
      const clip = graph.clips[id];
      outClips[id] = {
        ...clip,
        frames: clip.frames.map((frame) =>
          frame.map(([slot, transform, tint, ...rest]) => [
            slot,
            renumber(matrixIndex, matrices, graph.matrices, transform),
            renumber(colorIndex, colors, graph.colors, tint),
            ...rest,
          ]),
        ),
      };
    }
    const {
      exports: _e,
      shapes: _s,
      clips: _c,
      matrices: _m,
      colors: _k,
      textures: _t,
      ...rest
    } = graph;
    scenes[name] = {
      ...rest,
      exports: Object.fromEntries([...exports].sort().map((e) => [e, graph.exports[e]])),
      shapes: outShapes,
      clips: outClips,
      matrices,
      colors,
      textures,
    };
  }
  const levelRow = {
    ...row,
    refs: Object.fromEntries(FIELDS.filter((f) => row.refs[f]).map((f) => [f, row.refs[f]])),
  };
  return { pack: { kind: family.kind, levels: [levelRow], scenes }, files };
}

let packs = 0,
  pagesWritten = 0,
  before = 0,
  after = 0,
  mismatches = 0;
const levels = {};
const expected = new Set();
for (const [kind, entry] of Object.entries(index).sort(([a], [b]) => a.localeCompare(b))) {
  if (entry.variants) continue;
  const family = JSON.parse(await fs.readFile(path.join(PUBLIC, entry.path), 'utf8'));
  let familyTexels = 0;
  for (const graph of Object.values(family.scenes))
    for (const t of Object.values(graph.textures)) familyTexels += t.width * t.height;
  const seen = new Set();
  for (const row of family.levels) {
    if (seen.has(row.level)) continue;
    seen.add(row.level);
    // A Spell Tower mode or Town Hall weapon is drawn in place of the idle export at home too.
    if (Object.keys(row.refs).some((f) => /^(Mode|Weapon)/.test(f))) continue;
    const { pack: levelPack, files } = await splitLevel(kind, family, row);
    let texels = 0;
    for (const page of files.values()) texels += page.width * page.height;
    if (!files.size || texels > familyTexels * WORTH) continue;
    (levels[kind] ??= []).push(row.level);
    before += familyTexels;
    after += texels;
    const json = JSON.stringify(levelPack) + '\n';
    const target = path.join(PUBLIC, OUT, kind, `${row.level}.json`);
    expected.add(target);
    packs++;
    if (check) {
      const existing = await fs.readFile(target, 'utf8').catch(() => '');
      if (existing !== json) {
        console.error(`${kind} level ${row.level}: pack differs`);
        mismatches++;
      }
    } else {
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, json);
    }
    for (const [file, page] of files) {
      pagesWritten++;
      const full = path.join(PUBLIC, file);
      expected.add(full);
      if (check) {
        const decoded = await sharp(full)
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
          .catch(() => null);
        if (
          !decoded ||
          decoded.info.width !== page.width ||
          decoded.info.height !== page.height ||
          !decoded.data.equals(page.pixels)
        ) {
          console.error(`${file}: pixels differ`);
          mismatches++;
        }
      } else
        await sharp(page.pixels, { raw: { width: page.width, height: page.height, channels: 4 } })
          .png({ compressionLevel: 9 })
          .toFile(full);
    }
  }
  sources.clear();
}
// Files no longer produced would otherwise linger in public/ and ship.
const stale = [];
for (const dir of await fs.readdir(path.join(PUBLIC, OUT)).catch(() => []))
  for (const file of await fs.readdir(path.join(PUBLIC, OUT, dir)))
    if (!expected.has(path.join(PUBLIC, OUT, dir, file))) stale.push(path.join(OUT, dir, file));
const indexFile = path.join(ROOT, 'reference/full-client/village-levels.json');
const indexJson =
  JSON.stringify(
    {
      scope:
        'Building levels with a per-level idle pack in public/assets/village-levels; generated by scripts/split-village-art.mjs.',
      fields: FIELDS,
      levels,
    },
    null,
    2,
  ) + '\n';
if (check) {
  if ((await fs.readFile(indexFile, 'utf8').catch(() => '')) !== indexJson) {
    console.error('reference/full-client/village-levels.json differs');
    mismatches++;
  }
  for (const file of stale) {
    console.error(`${file}: no longer produced`);
    mismatches++;
  }
} else {
  await fs.writeFile(indexFile, indexJson);
  for (const file of stale) await fs.rm(path.join(PUBLIC, file));
}
console.log(
  `${check ? 'Checked' : 'Wrote'} ${packs} level packs, ${pagesWritten} atlases: ` +
    `${(after / 1e6).toFixed(1)}M texels where the family atlases hold ${(before / 1e6).toFixed(1)}M`,
);
if (mismatches) process.exit(1);
