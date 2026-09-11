import sharp from 'sharp';

await sharp('art/source/terrain-expanded-v2.png')
  .webp({ quality: 90 })
  .toFile('public/assets/environment/terrain-expanded-v2.webp');
console.log('Expanded village terrain prepared.');
