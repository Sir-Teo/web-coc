/**
 * Production texture compression: writes a lossless WebP beside every PNG under dist/assets and
 * points the built code, packs and styles at it.
 *
 * The repository keeps PNG sources (asset scripts regenerate and byte-check them, and dev/specs
 * read them), so this runs on the build output only. The encoding is lossless with `exact`, so
 * every RGBA value, including colors under zero alpha, survives; the shipped PNGs carry no gamma
 * or color-profile chunks, so browsers decode both formats to the same pixels. PNGs stay in dist
 * for any reference the rewrite cannot see. Encodings are cached by source hash.
 *
 *   node scripts/webp-dist.mjs            # after `vite build`, before scripts/build-sw.mjs
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { cpus } from 'node:os';
import sharp from 'sharp';

const dist = path.resolve('dist');
const assets = path.join(dist, 'assets');
const cache = path.resolve('node_modules/.cache/webp-dist');
const SETTINGS = { lossless: true, exact: true, effort: 4 };
const settingsKey = JSON.stringify(SETTINGS);

async function walk(dir, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = await walk(dist);
const pngs = files.filter((f) => f.startsWith(assets + path.sep) && f.endsWith('.png'));
await fs.mkdir(cache, { recursive: true });

let pngBytes = 0,
  webpBytes = 0,
  encoded = 0;
const queue = [...pngs];
async function worker() {
  for (let file = queue.pop(); file; file = queue.pop()) {
    const source = await fs.readFile(file);
    const hash = createHash('sha1').update(settingsKey).update(source).digest('hex');
    const cached = path.join(cache, hash + '.webp');
    let webp;
    try {
      webp = await fs.readFile(cached);
    } catch {
      webp = await sharp(source).webp(SETTINGS).toBuffer();
      await fs.writeFile(cached, webp);
      encoded++;
    }
    await fs.writeFile(file.slice(0, -4) + '.webp', webp);
    pngBytes += source.length;
    webpBytes += webp.length;
  }
}
await Promise.all(Array.from({ length: Math.max(1, cpus().length) }, worker));

// Every PNG under assets/ now has a WebP beside it, so any path to one can switch, including
// template literals whose tail is `.png` (`.../level-${level}.png`).
const REFERENCE = /(\/?assets\/[^"'`\s()<>\\]*?)\.png(?=["'`)\s\\])/g;
let rewritten = 0;
for (const file of files) {
  if (!/\.(js|json|css|html)$/.test(file)) continue;
  const text = await fs.readFile(file, 'utf8');
  const next = text.replace(REFERENCE, '$1.webp');
  if (next !== text) {
    await fs.writeFile(file, next);
    rewritten++;
  }
}

console.log(
  `WebP textures: ${pngs.length} files, ${(pngBytes / 1e6).toFixed(1)} MB PNG -> ` +
    `${(webpBytes / 1e6).toFixed(1)} MB WebP (${encoded} encoded, ${pngs.length - encoded} cached); ` +
    `${rewritten} files point at WebP`,
);
