import sharp from 'sharp';
import fs from 'node:fs/promises';

const check = process.argv.includes('--check');
const { data, info } = await sharp('art/source/goblin-buildings-v1/matte.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1774 || info.height !== 887) throw Error('Unexpected Goblin sheet dimensions');
// The two subjects contain no magenta. Preserve grey stone and the green banner.
for (let p = 0; p < data.length; p += 4) {
  const excess = Math.min(data[p], data[p + 2]) - data[p + 1];
  if (excess > 12) {
    data[p + 3] = Math.round(255 * Math.max(0, 1 - (excess - 12) / 160));
    data[p + 2] = Math.min(data[p + 2], data[p + 1] + 8);
  }
}
const sheet = await sharp(data, { raw: info }).png().toBuffer();
for (const [name, left, width] of [
  ['goblin-townhall', 0, 1024],
  ['goblin-hut', 1024, 750],
]) {
  const cropped = await sharp(sheet).extract({ left, top: 0, width, height: 887 }).png().toBuffer();
  const building = await sharp(cropped).trim().resize({ width: 430 }).png().toBuffer();
  const meta = await sharp(building).metadata();
  const bytes = await sharp({
    create: { width: 512, height: 512, channels: 4, background: '#00000000' },
  })
    .composite([{ input: building, left: 41, top: 451 - meta.height }])
    .webp({ lossless: true })
    .toBuffer();
  const path = `public/assets/buildings/${name}-v1.webp`;
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} differs from source`);
  } else await fs.writeFile(path, bytes);
  console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
}
