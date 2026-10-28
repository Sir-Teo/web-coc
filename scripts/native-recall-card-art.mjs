#!/usr/bin/env node
// Source body portraits for returned Super Hog halves. Requires the local Vite dev server.
// npm run dev; node scripts/native-recall-card-art.mjs [--check]
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checking = process.argv.includes('--check');
const metadataPath = path.join(root, 'reference/super-hog-recall/card-art.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const pins = new Map();
async function source(file) {
  const bytes = await fs.readFile(path.join(root, file));
  pins.set(file, hash(bytes));
  return bytes;
}
const jobs = [];
for (const kind of ['superhog', 'superrider']) {
  const file = `public/assets/troops-native/${kind}/graph.json`;
  const pack = JSON.parse(await source(file));
  const state = pack.levels.find((row) => row.level === 1).states.idle;
  const graph = pack.scenes[state.scene];
  for (const texture of Object.values(graph.textures)) await source(`public/${texture.path}`);
  jobs.push({
    kind,
    graph,
    scene: state.scene,
    export: state.exports[2],
    path: `assets/recall-cards/${kind}.png`,
    level: 1,
    seconds: 0,
  });
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
let rendered;
try {
  const page = await browser.newPage({
    viewport: { width: 1000, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.goto(process.env.GAME_URL ?? 'http://localhost:5173/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  rendered = await page.evaluate(async (jobs) => {
    const { scene } = window.__game,
      { nativeScenePoses, nativeMeshTexture } = await import('/src/game/native-mesh.ts'),
      { NativeSceneView, nativeSceneBounds } = await import('/src/game/native-scene-view.ts'),
      { createUnmaskedRenderTexture } = await import('/src/game/native-group-buffer.ts');
    scene.paused = true;
    const rows = [];
    for (const job of jobs) {
      const prefix = `recall-card:${job.kind}:${job.scene}`;
      for (const [id, texture] of Object.entries(job.graph.textures)) {
        const image = new Image();
        image.src = '/' + texture.path;
        await image.decode();
        scene.textures.addImage(nativeMeshTexture(prefix, id), image);
      }
      const size = 128,
        padding = 8,
        poses = nativeScenePoses(job.graph, job.export, job.seconds),
        bounds = nativeSceneBounds(poses),
        scale = (size - 2 * padding) / Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]),
        x = (size - (bounds[2] - bounds[0]) * scale) / 2 - bounds[0] * scale,
        y = (size - (bounds[3] - bounds[1]) * scale) / 2 - bounds[1] * scale,
        matrix = [scale, 0, x, 0, scale, y],
        view = new NativeSceneView(scene, prefix, true),
        target = createUnmaskedRenderTexture(scene, size, size);
      view.render(nativeScenePoses(job.graph, job.export, job.seconds, {}, matrix), 0, 0, 0, 1, 2);
      target.clear().draw(view.objects).render();
      const png = await new Promise((resolve) => target.snapshot((image) => resolve(image.src)));
      target.destroy();
      view.destroy();
      const { graph, ...record } = job;
      rows.push({ ...record, size, padding, bounds, matrix, png });
    }
    return rows;
  }, jobs);
} finally {
  await browser.close();
}

const inputs = Object.fromEntries([...pins.entries()].sort(([a], [b]) => a.localeCompare(b)));
const records = [];
const previous = checking ? JSON.parse(await fs.readFile(metadataPath, 'utf8')) : undefined;
if (checking && JSON.stringify(previous.inputs) !== JSON.stringify(inputs))
  throw Error('Source fingerprints changed; rebuild and review the Recall card art.');
for (const row of rendered) {
  const { png, ...recipe } = row,
    bytes = Buffer.from(png.split(',')[1], 'base64'),
    file = path.join(root, 'public', row.path),
    rgba = await sharp(bytes).ensureAlpha().raw().toBuffer();
  if (checking) {
    const old = previous.records.find((r) => r.kind === row.kind),
      saved = await fs.readFile(file),
      decoded = await sharp(saved).ensureAlpha().raw().toBuffer(),
      { sha256, ...oldRecipe } = old;
    if (JSON.stringify(oldRecipe) !== JSON.stringify(recipe) || hash(saved) !== sha256)
      throw Error(`${row.kind}: recipe or committed PNG changed`);
    if (rgba.length !== decoded.length || rgba.some((value, i) => Math.abs(value - decoded[i]) > 1))
      throw Error(`${row.kind}: rendered pixels changed beyond 1/255 GPU rounding`);
    console.log(`Verified ${row.path}`);
  } else {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, bytes);
    records.push({ ...recipe, sha256: hash(bytes) });
    console.log(`Wrote ${row.path}`);
  }
}
if (!checking)
  await fs.writeFile(
    metadataPath,
    JSON.stringify(
      {
        client: '18.400.21',
        bundle: '7f04bdfdc4124b1f49308423bb8f4aa8b137aae3',
        renderer: 'Phaser 4.2.1 native scene renderer, straight-alpha PNG',
        inputs,
        records,
      },
      null,
      2,
    ) + '\n',
  );
