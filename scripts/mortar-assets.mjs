import sharp from 'sharp';
import fs from 'node:fs/promises';

// Accepted original renders. Levels 4/6 use a generated magenta matte; the
// others carry native alpha. Rebuilding has no image-service/network dependency.
const source = 'art/source/mortar-levels-v1';
const destination = 'public/assets/buildings/mortar-levels-v1';
const check = process.argv.includes('--check');
if (!check) await fs.mkdir(destination, { recursive: true });
for (let level = 1; level <= 6; level++) {
  const input = `${source}/level-${level}.png`;
  let cutout = await fs.readFile(input);
  if (level === 4 || level === 6) {
    const { data, info } = await sharp(cutout)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let p = 0; p < data.length; p += 4) {
      // Magenta is absent from the object materials. Remove the matte and its
      // antialiased fringe before resizing; preserve blue braces and dark bore.
      const excess = Math.min(data[p], data[p + 2]) - data[p + 1];
      if (excess > 45 && data[p] > data[p + 1] * 1.4) {
        const alpha = Math.max(0, 1 - excess / 180);
        data[p + 3] = Math.round(255 * alpha);
        data[p] = Math.min(data[p], data[p + 1] + 35);
        data[p + 2] = Math.min(data[p + 2], data[p + 1] + 35);
      }
    }
    cutout = await sharp(data, { raw: info }).png().toBuffer();
  }
  const stats = await sharp(cutout).stats();
  if (stats.channels.length !== 4 || stats.channels[3].min !== 0)
    throw Error(`${input} must have genuine transparency.`);
  // Generated alpha occasionally leaves otherwise solid material at 253/255.
  // Snap near-opaque source pixels before filtering, retaining soft edge alpha.
  const rgba = await sharp(cutout).raw().toBuffer({ resolveWithObject: true });
  for (let p = 3; p < rgba.data.length; p += 4) if (rgba.data[p] >= 240) rgba.data[p] = 255;
  cutout = await sharp(rgba.data, { raw: rgba.info }).png().toBuffer();
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
  `${check ? 'Verified' : 'Built'} six distinct Mortar levels with aligned transparent 384px frames.`,
);
