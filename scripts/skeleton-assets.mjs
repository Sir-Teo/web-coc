import fs from 'node:fs/promises';
import sharp from 'sharp';

const check = process.argv.includes('--check');
const canvas = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: '#00000000' } });

async function cells(name, count) {
  const path = `art/source/skeleton-v1/${name}.png`,
    metadata = await sharp(path).metadata(),
    stats = await sharp(path).stats();
  if (!metadata.hasAlpha || stats.channels[3].min !== 0 || metadata.width % count)
    throw Error(`${path}: evenly spaced cells with actual alpha required`);
  const width = metadata.width / count;
  const frames = [];
  for (let i = 0; i < count; i++) {
    const frame = sharp(path).extract({ left: i * width, top: 0, width, height: metadata.height });
    const { data, info } = await frame.clone().raw().toBuffer({ resolveWithObject: true });
    let left = width,
      top = info.height,
      right = 0,
      bottom = 0;
    for (let y = 0; y < info.height; y++)
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 12) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    const w = right - left + 1,
      h = bottom - top + 1;
    frames.push({
      image: sharp(data, { raw: info }).extract({ left, top, width: w, height: h }),
      width: w,
      height: h,
    });
  }
  return frames;
}
async function save(path, input) {
  const bytes = await input.webp({ lossless: true, effort: 6 }).toBuffer();
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`Rebuild differs: ${path}`);
  } else {
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, bytes);
  }
}
async function fitted(frames, size, maxWidth, maxHeight, baseline) {
  const scale = Math.min(
    maxWidth / Math.max(...frames.map((f) => f.width)),
    maxHeight / Math.max(...frames.map((f) => f.height)),
  );
  return Promise.all(
    frames.map(async (f) => {
      const width = Math.round(f.width * scale),
        height = Math.round(f.height * scale);
      return canvas(size, size)
        .composite([
          {
            input: await f.image.resize(width, height).png().toBuffer(),
            left: Math.round((size - width) / 2),
            top: baseline - height,
          },
        ])
        .png()
        .toBuffer();
    }),
  );
}
const traps = await fitted(await cells('traps', 3), 256, 216, 216, 232);
for (const [i, mode] of ['ground', 'air', 'spent'].entries())
  await save(`public/assets/buildings/skeleton-trap-v1/${mode}.webp`, sharp(traps[i]));
for (const mode of ['ground', 'air']) {
  // Separate source strips leave clear space around the wider sword strikes.
  const frames = [
    ...(await fitted(await cells(`${mode}-walk`, 4), 128, 110, mode === 'ground' ? 92 : 104, 112)),
    ...(await fitted(await cells(`${mode}-attack`, 2), 128, 110, 104, 112)),
  ];
  await save(
    `public/assets/characters/skeleton-v1/${mode}.webp`,
    canvas(768, 128).composite(frames.map((input, i) => ({ input, left: i * 128, top: 0 }))),
  );
}
console.log(
  `Skeleton art ${check ? 'verified' : 'built'}: three coffin states and six poses for each ground/air defender.`,
);
