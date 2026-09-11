import sharp from 'sharp';
import fs from 'node:fs/promises';

await fs.mkdir('public/assets/environment', { recursive: true });
for (const material of ['stone', 'wood']) {
  const input = `art/source/ruins/${material}.png`;
  const stats = await sharp(input).stats();
  if (stats.channels.length !== 4 || stats.channels[3].min !== 0)
    throw new Error(`${input} requires genuine alpha transparency.`);
  await sharp(input)
    .trim({ background: '#00000000', threshold: 10 })
    .resize({ width: 400, height: 280, fit: 'inside' })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(`public/assets/environment/ruins-${material}.webp`);
}
console.log('Built two material-specific rubble sprites from accepted RGBA originals.');
