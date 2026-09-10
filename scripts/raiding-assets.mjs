import sharp from 'sharp';

// Preserve generated transparency; only trim and size for the production atlas.
for (const kind of ['goblin', 'wallbreaker']) {
  await sharp(`art/source/${kind}.png`)
    .trim({ background: '#00000000', threshold: 10 })
    .resize({ width: 360, height: 420, fit: 'inside' })
    .webp({ quality: 90 })
    .toFile(`public/assets/characters/${kind}.webp`);
}
console.log('Goblin and Wall Breaker sprites prepared.');
