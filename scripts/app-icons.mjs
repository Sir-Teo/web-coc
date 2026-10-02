// Home-screen icons rendered from public/favicon.svg. `--check` verifies the committed files.
//
// - app-icon-192.png / app-icon-512.png: the favicon as drawn, rounded corners included
//   (manifest purpose "any").
// - app-icon-maskable-512.png: a full-bleed square whose crown sits well inside the 80%
//   safe zone, so Android's circle, squircle and teardrop masks never cut it.
// - apple-touch-icon.png: the same full-bleed art at 180 px. iOS rounds the corners itself
//   and fills transparent pixels with black.
import sharp from 'sharp';
import fs from 'node:fs/promises';

const check = process.argv.includes('--check');
const favicon = await fs.readFile('public/favicon.svg', 'utf8');
const background = favicon.match(/<rect [^>]*fill="(#[0-9a-f]{6})"\/>/i);
if (!background) throw Error('public/favicon.svg: expected a filled background <rect>');
const glyph = favicon.slice(
  favicon.indexOf(background[0]) + background[0].length,
  favicon.lastIndexOf('</svg>'),
);
// The crown spans x 12–52 and y 13–49 of the 64-unit favicon; centre it and leave a margin.
const fullBleed =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  `<rect width="64" height="64" fill="${background[1]}"/>` +
  `<g transform="translate(32 32) scale(0.82) translate(-32 -31)">${glyph}</g></svg>`;

const render = (svg, size) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 64 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

const icons = {
  'public/app-icon-192.png': await render(favicon, 192),
  'public/app-icon-512.png': await render(favicon, 512),
  'public/app-icon-maskable-512.png': await render(fullBleed, 512),
  'public/apple-touch-icon.png': await render(fullBleed, 180),
};
for (const [path, bytes] of Object.entries(icons)) {
  if (check) {
    const committed = await fs.readFile(path).catch(() => null);
    if (!committed?.equals(bytes)) throw Error(`${path} is stale; run node scripts/app-icons.mjs`);
  } else await fs.writeFile(path, bytes);
}
console.log(`${check ? 'Checked' : 'Wrote'} ${Object.keys(icons).length} app icons.`);
