import sharp from 'sharp';
for (const kind of ['king', 'herohall', 'darkdrill', 'darkstorage']) {
  const source = `art/source/heroes/${kind}.png`;
  const stats = await sharp(source).stats();
  if (stats.channels.length !== 4 || stats.channels[3].min !== 0)
    throw Error(`${kind} requires source alpha`);
  await sharp(source)
    .trim({ background: '#00000000', threshold: 10 })
    .resize({ width: 384, height: 440, fit: 'inside' })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toFile(`public/assets/${kind === 'king' ? 'characters' : 'buildings'}/${kind}.webp`);
}
console.log('Built the king, Hero Hall, and dark elixir buildings.');
