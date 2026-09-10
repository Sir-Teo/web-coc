import sharp from 'sharp';
import fs from 'node:fs/promises';
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
await fs.mkdir('public/assets/buildings/tier3', { recursive: true });
const xs = [0, 423, 800, 1175, 1536],
  ys = [0, 352, 687, 1024];
for (let i = 0; i < 12; i++) {
  const row = Math.floor(i / 4),
    col = i % 4;
  const cropped = await sharp('art/source/buildings-tier3.png')
    .extract({
      left: xs[col],
      top: ys[row],
      width: xs[col + 1] - xs[col],
      height: ys[row + 1] - ys[row],
    })
    .toBuffer();
  await sharp(cropped)
    .trim({ background: '#00000000', threshold: 30 })
    .resize({ width: 400, height: 400, fit: 'inside' })
    .webp({ quality: 90 })
    .toFile(`public/assets/buildings/tier3/${names[i]}.webp`);
}
console.log('Twelve max-level building sprites prepared.');
