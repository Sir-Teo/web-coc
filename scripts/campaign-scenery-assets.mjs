import fs from 'node:fs/promises';
import sharp from 'sharp';
const names = [
  'pine',
  'rock',
  'sharp-rock',
  'stump',
  'log',
  'mushrooms',
  'tombstone',
  'torch',
  'pole',
  'windmeter',
  'campfire',
  'statue',
  'skull-flag',
  'arrow-flag',
  'flowers',
  'christmas',
];
const check = process.argv.includes('--check');
const { data, info } = await sharp('art/source/campaign-scenery-v1/generated.png')
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1254 || info.height !== 1254) throw Error('Unexpected scenery sheet dimensions');
for (let p = 0; p < data.length; p += 4) {
  const excess = Math.min(data[p], data[p + 2]) - data[p + 1];
  if (excess > 12) {
    data[p + 3] = Math.round(255 * Math.max(0, 1 - (excess - 12) / 160));
    data[p + 2] = Math.min(data[p + 2], data[p + 1] + 8);
  }
}
const sheet = await sharp(data, { raw: info }).png().toBuffer();
for (const [i, name] of names.entries()) {
  const x = i % 4,
    y = Math.floor(i / 4),
    left = Math.floor((x * 1254) / 4),
    top = Math.floor((y * 1254) / 4);
  const cell = await sharp(sheet)
    .extract({
      left,
      top,
      width: Math.floor(((x + 1) * 1254) / 4) - left,
      height: Math.floor(((y + 1) * 1254) / 4) - top,
    })
    .png()
    .toBuffer();
  const sprite = await sharp(cell)
    .trim()
    .resize({ width: 212, height: 208, fit: 'inside' })
    .png()
    .toBuffer();
  const meta = await sharp(sprite).metadata();
  const bytes = await sharp({
    create: { width: 256, height: 256, channels: 4, background: '#00000000' },
  })
    .composite([
      { input: sprite, left: Math.round((256 - meta.width) / 2), top: 225 - meta.height },
    ])
    .webp({ lossless: true })
    .toBuffer();
  const path = `public/assets/environment/campaign/${name}-v1.webp`;
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} differs from source`);
  } else {
    await fs.mkdir('public/assets/environment/campaign', { recursive: true });
    await fs.writeFile(path, bytes);
  }
  console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
}
