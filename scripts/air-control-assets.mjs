import fs from 'node:fs/promises';
import sharp from 'sharp';

const root = 'art/source/air-control-v1';
const check = process.argv.includes('--check');
async function write(path, bytes) {
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`Rebuild differs: ${path}`);
  } else {
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, bytes);
  }
}

async function cells(path, columns, rows) {
  const meta = await sharp(path).metadata();
  const stats = await sharp(path).stats();
  if (!meta.hasAlpha || stats.channels[3].min !== 0) throw Error(`${path}: genuine alpha required`);
  const result = [];
  for (let i = 0; i < columns * rows; i++) {
    const left = Math.round(((i % columns) * meta.width) / columns);
    const top = Math.round((Math.floor(i / columns) * meta.height) / rows);
    const width = Math.round((((i % columns) + 1) * meta.width) / columns) - left;
    const height = Math.round(((Math.floor(i / columns) + 1) * meta.height) / rows) - top;
    const { data, info } = await sharp(path)
      .extract({ left, top, width, height })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    // Remove stray near-transparent generated pixels; retain antialiased edge coverage.
    let x0 = width,
      y0 = height,
      x1 = 0,
      y1 = 0;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const p = (y * width + x) * 4;
        if (data[p + 3] < 12) data[p + 3] = 0;
        if (data[p + 3] > 248) data[p + 3] = 255;
        if (data[p + 3]) {
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    const w = x1 - x0 + 1,
      h = y1 - y0 + 1;
    result.push({
      data: await sharp(data, { raw: info })
        .extract({ left: x0, top: y0, width: w, height: h })
        .png()
        .toBuffer(),
      width: w,
      height: h,
    });
  }
  return result;
}

for (let level = 1; level <= 4; level++) {
  const frames = await cells(`${root}/level-${level}.png`, 4, 2);
  const scale = Math.min(
    352 / Math.max(...frames.map((f) => f.width)),
    336 / Math.max(...frames.map((f) => f.height)),
  );
  for (let d = 0; d < 8; d++) {
    const f = frames[d],
      width = Math.round(f.width * scale),
      height = Math.round(f.height * scale);
    const image = await sharp(f.data).resize(width, height).png().toBuffer();
    const bytes = await sharp({
      create: { width: 384, height: 384, channels: 4, background: '#00000000' },
    })
      .composite([{ input: image, left: Math.round((384 - width) / 2), top: 352 - height }])
      .webp({ lossless: true, effort: 6 })
      .toBuffer();
    await write(`public/assets/buildings/airsweeper-v1/level-${level}-${d}.webp`, bytes);
  }
}
const mine = await cells(`${root}/mine.png`, 3, 1);
for (const [i, state] of ['armed', 'flying', 'spent'].entries()) {
  const bytes = await sharp(mine[i].data)
    .resize({ width: 352, height: 352, fit: 'inside' })
    .extend({ top: 8, bottom: 8, left: 8, right: 8, background: '#00000000' })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  await write(`public/assets/buildings/seekingairmine-v1/${state}.webp`, bytes);
}
console.log(
  `Air control art ${check ? 'verified' : 'built'}: 32 directional sprites and 3 mine states.`,
);
