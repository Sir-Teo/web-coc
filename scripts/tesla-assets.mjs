import fs from 'node:fs/promises';
import sharp from 'sharp';

const check = process.argv.includes('--check');
const output = 'public/assets/buildings/tesla-v1';
if (!check) await fs.mkdir(output, { recursive: true });
for (let level = 1; level <= 6; level++) {
  const path = `art/source/tesla-v1/level-${level}.png`;
  const metadata = await sharp(path).metadata();
  const stats = await sharp(path).stats();
  if (!metadata.hasAlpha || stats.channels[3].min !== 0)
    throw Error(`${path}: actual alpha required`);
  const { data, info } = await sharp(path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let x0 = info.width,
    y0 = info.height,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      if (data[p + 3] < 12) data[p + 3] = 0;
      if (data[p + 3] > 248) data[p + 3] = 255;
      if (data[p + 3]) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  const width = x1 - x0 + 1,
    height = y1 - y0 + 1,
    scale = Math.min(336 / width, 432 / height);
  const w = Math.round(width * scale),
    h = Math.round(height * scale);
  const sprite = await sharp(data, { raw: info })
    .extract({ left: x0, top: y0, width, height })
    .resize(w, h)
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: { width: 384, height: 512, channels: 4, background: '#00000000' },
  })
    .composite([{ input: sprite, left: Math.round((384 - w) / 2), top: 468 - h }])
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const target = `${output}/level-${level}.webp`;
  if (check) {
    if (!bytes.equals(await fs.readFile(target))) throw Error(`Rebuild differs: ${target}`);
  } else await fs.writeFile(target, bytes);
}
console.log(`Tesla art ${check ? 'verified' : 'built'}: six transparent level sprites.`);
