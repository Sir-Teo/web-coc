#!/usr/bin/env node
// Rasterizes the authored Crafted Defense art (art/source/crafted-defenses-v1/*.svg) to the
// shipping PNGs in public/assets/crafted. The client's own art for these defenses is not in
// this repository. Usage: node scripts/crafted-defense-art.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'art/source/crafted-defenses-v1');
const out = path.join(root, 'public/assets/crafted');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const page = await browser.newPage({ viewport: { width: 180, height: 180 }, deviceScaleFactor: 2 });
for (const file of fs
  .readdirSync(source)
  .filter((f) => f.endsWith('.svg'))
  .sort()) {
  const svg = fs.readFileSync(path.join(source, file), 'utf8');
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}</style>${svg.replace('<svg ', '<svg style="display:block" ')}`,
  );
  const png = path.join(out, file.replace(/\.svg$/, '.png'));
  await page.screenshot({
    path: png,
    omitBackground: true,
    clip: { x: 0, y: 0, width: 180, height: 180 },
  });
  console.log(`Wrote ${path.relative(root, png)}`);
}
await browser.close();
