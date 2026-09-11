import sharp from 'sharp';
import fs from 'node:fs/promises';

const output = 'public/assets/environment/terrain-field-v4.webp';
const encoded = await sharp('art/source/terrain-field-v4.png').webp({ quality: 90 }).toBuffer();
if (process.argv.includes('--check')) {
  if (!encoded.equals(await fs.readFile(output)))
    throw new Error('Terrain asset is stale. Run node scripts/terrain-assets.mjs.');
  console.log('Village field terrain matches its source.');
} else {
  await fs.writeFile(output, encoded);
  console.log('Village field terrain prepared.');
}
