import sharp from 'sharp';
import fs from 'node:fs/promises';
await fs.mkdir('public/assets/characters', { recursive: true });
await fs.mkdir('public/assets/environment', { recursive: true });
const names = [
  'townhall',
  'goldmine',
  'collector',
  'goldstorage',
  'elixirstorage',
  'barracks',
  'cannon',
  'archertower',
  'camp',
  'builder',
  'mortar',
  'laboratory',
];
// Cell boundaries measured against the generated atlas. Retain generated alpha.
for (let i = 0; i < 12; i++) {
  const row = Math.floor(i / 4),
    col = i % 4;
  const xs = [0, 412, 798, 1180, 1536],
    ys = [0, 354, 697, 1024];
  const box = {
    left: xs[col],
    top: ys[row],
    width: xs[col + 1] - xs[col],
    height: ys[row + 1] - ys[row],
  };
  await sharp(await sharp('art/source/buildings.png').extract(box).toBuffer())
    .trim({ background: '#00000000', threshold: 30 })
    .resize({ width: 400, height: 400, fit: 'inside' })
    .webp({ quality: 90 })
    .toFile(`public/assets/buildings/${names[i]}.webp`);
}
const units = ['swordsman', 'archer', 'giant', 'wizard', 'wall', 'trees', 'rocks', 'flag'];
for (let i = 0; i < 8; i++) {
  const row = Math.floor(i / 4),
    col = i % 4;
  const xs = [0, 425, 749, 1170, 1536],
    ys = [0, 545, 1024];
  await sharp(
    await sharp('art/source/characters.png')
      .extract({
        left: xs[col],
        top: ys[row],
        width: xs[col + 1] - xs[col],
        height: ys[row + 1] - ys[row],
      })
      .toBuffer(),
  )
    .trim({ background: '#00000000', threshold: 30 })
    .resize({ width: 360, height: 420, fit: 'inside' })
    .webp({ quality: 90 })
    .toFile(`public/assets/${row ? 'environment' : 'characters'}/${units[i]}.webp`);
}
await sharp('art/source/terrain.png')
  .webp({ quality: 88 })
  .toFile('public/assets/environment/terrain.webp');
console.log('21 production WebP assets prepared.');
