import sharp from 'sharp';
import fs from 'node:fs/promises';

const kinds = ['wizardtower', 'bomb', 'giantbomb', 'airbomb', 'springtrap'];
await fs.mkdir('public/assets/buildings', { recursive: true });
for (const kind of kinds) {
  const source = `art/source/defenses/${kind}.png`;
  const stats = await sharp(source).stats();
  if (stats.channels.length !== 4 || stats.channels[3].min !== 0)
    throw new Error(`${kind} requires genuine source transparency`);
  await sharp(source)
    .trim({ background: '#00000000', threshold: 10 })
    .resize({ width: 384, height: 440, fit: 'inside' })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(`public/assets/buildings/${kind}.webp`);
}
console.log('Built five defense sprites, preserving generated alpha.');
