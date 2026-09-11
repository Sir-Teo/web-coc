import sharp from 'sharp';
import fs from 'node:fs/promises';

// Original built-in ImageGen renders, with a flat generated magenta matte.
// Retain the sources so this import is deterministic and needs no image service.
const source = 'art/source/camp-levels-v1';
const destination = 'public/assets/buildings/camp-levels-v1';
const check = process.argv.includes('--check');
const requested = process.argv.find((arg) => arg.startsWith('--levels='));
const levels = requested ? requested.slice(9).split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
if (!check) await fs.mkdir(destination, { recursive: true });
for (const level of levels) {
  if (!Number.isInteger(level) || level < 1 || level > 8) throw Error('Invalid camp level.');
  const input = `${source}/level-${level}.png`;
  const rgba = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let p = 0; p < rgba.data.length; p += 4) {
    const d = rgba.data;
    // No foreground material contains magenta: distinguish it from red meat,
    // orange fire, green carrot leaves, gray stones and brown timber.
    const excess = Math.min(d[p], d[p + 2]) - d[p + 1];
    if (excess > 45 && d[p] > d[p + 1] * 1.4) {
      d[p + 3] = Math.round(255 * Math.max(0, 1 - excess / 180));
      d[p] = Math.min(d[p], d[p + 1] + 35);
      d[p + 2] = Math.min(d[p + 2], d[p + 1] + 35);
    } else if (d[p + 3] >= 240) d[p + 3] = 255;
  }
  const cutout = await sharp(rgba.data, { raw: rgba.info }).png().toBuffer();
  const stats = await sharp(cutout).stats();
  if (stats.channels[3].min !== 0) throw Error(`${input} has no transparent background.`);
  const sprite = await sharp(cutout)
    .trim({ background: '#00000000', threshold: 8 })
    .resize({ width: 350, height: 350, fit: 'inside' })
    .png()
    .toBuffer();
  const { width, height } = await sharp(sprite).metadata();
  const encoded = await sharp({
    create: { width: 384, height: 384, channels: 4, background: '#00000000' },
  })
    .composite([{ input: sprite, left: Math.floor((384 - width) / 2), top: 366 - height }])
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const output = `${destination}/level-${level}.webp`;
  if (check) {
    if (!encoded.equals(await fs.readFile(output)))
      throw Error(`${output} differs from its source render.`);
  } else await fs.writeFile(output, encoded);
}
console.log(
  `${check ? 'Verified' : 'Built'} ${levels.length} camp levels with transparent 384px frames.`,
);
