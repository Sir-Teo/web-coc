import sharp from 'sharp';
import fs from 'node:fs/promises';

const check = process.argv.includes('--check');
const root = 'art/source/blacksmith-v1';
async function emit(path, bytes) {
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} differs from source`);
  } else {
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, bytes);
  }
  console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
}
// Keep the building's generated alpha, registered to the scene's 88% ground origin.
const building = await sharp(`${root}/building.png`)
  .trim()
  .resize({ width: 430, height: 440, fit: 'inside' })
  .png()
  .toBuffer();
const meta = await sharp(building).metadata();
await emit(
  'public/assets/buildings/blacksmith.webp',
  await sharp({ create: { width: 512, height: 512, channels: 4, background: '#00000000' } })
    .composite([
      { input: building, left: Math.round((512 - meta.width) / 2), top: 451 - meta.height },
    ])
    .webp({ lossless: true })
    .toBuffer(),
);

const { data, info } = await sharp(`${root}/icons.png`)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1536 || info.height !== 1024) throw Error('Unexpected icon sheet size');
// Generated green matte: none of these six subjects use green pigment. Preserve blue glass.
for (let p = 0; p < data.length; p += 4) {
  const excess = data[p + 1] - Math.max(data[p], data[p + 2]);
  if (excess > 18) {
    data[p + 3] = Math.round(255 * Math.max(0, 1 - (excess - 18) / 150));
    data[p + 1] = Math.min(data[p + 1], Math.max(data[p], data[p + 2]) + 12);
  }
}
const sheet = await sharp(data, { raw: info }).png().toBuffer();
for (const [i, kind] of ['puppet', 'vial', 'boots', 'shiny', 'glowy', 'starry'].entries()) {
  const cell = await sharp(sheet)
    .extract({ left: (i % 3) * 512, top: Math.floor(i / 3) * 512, width: 512, height: 512 })
    .png()
    .toBuffer();
  const resizedPng = await sharp(cell)
    .trim()
    .resize({ width: 216, height: 216, fit: 'inside' })
    .png()
    .toBuffer();
  const resized = await sharp(resizedPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Filtering can bring back matte hue at a few semi-transparent silhouette pixels.
  for (let p = 0; p < resized.data.length; p += 4)
    resized.data[p + 1] = Math.min(
      resized.data[p + 1],
      Math.max(resized.data[p], resized.data[p + 2]) + 12,
    );
  const crop = await sharp(resized.data, { raw: resized.info }).png().toBuffer();
  const size = await sharp(crop).metadata();
  await emit(
    `public/assets/equipment/${kind}-v1.webp`,
    await sharp({ create: { width: 256, height: 256, channels: 4, background: '#00000000' } })
      .composite([
        {
          input: crop,
          left: Math.round((256 - size.width) / 2),
          top: Math.round((256 - size.height) / 2),
        },
      ])
      .webp({ lossless: true })
      .toBuffer(),
  );
}
