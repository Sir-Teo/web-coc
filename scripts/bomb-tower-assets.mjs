import fs from 'node:fs/promises';
import sharp from 'sharp';

const check = process.argv.includes('--check');
const output = 'public/assets/buildings/bombtower-v1';
if (!check) await fs.mkdir(output, { recursive: true });
async function source(name) {
  const path = `art/source/bombtower-v1/${name}.png`;
  const metadata = await sharp(path).metadata();
  const stats = await sharp(path).stats();
  if (!metadata.hasAlpha || stats.channels[3].min !== 0)
    throw Error(`${path}: actual alpha required`);
  return sharp(path).ensureAlpha();
}
async function trim(input) {
  const { data, info } = await input.raw().toBuffer({ resolveWithObject: true });
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
  return {
    image: sharp(data, { raw: info }).extract({
      left: x0,
      top: y0,
      width: x1 - x0 + 1,
      height: y1 - y0 + 1,
    }),
    width: x1 - x0 + 1,
    height: y1 - y0 + 1,
  };
}
const canvas = (width, height) =>
  sharp({ create: { width, height, channels: 4, background: '#00000000' } });
async function save(name, input) {
  const bytes = await input.webp({ lossless: true, effort: 6 }).toBuffer();
  const target = `${output}/${name}.webp`;
  if (check) {
    if (!bytes.equals(await fs.readFile(target))) throw Error(`Rebuild differs: ${target}`);
  } else await fs.writeFile(target, bytes);
}
const sheet = await source('bomber'),
  meta = await sheet.metadata();
if (meta.width % 4) throw Error('Bomber source must contain four equal cells');
const frames = [];
for (let i = 0; i < 4; i++)
  frames.push(
    await trim(
      sheet
        .clone()
        .extract({
          left: (i * meta.width) / 4,
          top: 0,
          width: meta.width / 4,
          height: meta.height,
        }),
    ),
  );
const actorScale = Math.min(
  220 / Math.max(...frames.map((f) => f.width)),
  202 / Math.max(...frames.map((f) => f.height)),
);
const actors = [];
for (const frame of frames) {
  const w = Math.round(frame.width * actorScale),
    h = Math.round(frame.height * actorScale);
  actors.push(
    await canvas(256, 256)
      .composite([
        {
          input: await frame.image.resize(w, h).png().toBuffer(),
          left: Math.round((256 - w) / 2),
          top: 232 - h,
        },
      ])
      .png()
      .toBuffer(),
  );
}
await save(
  'bomber',
  canvas(1024, 256).composite(actors.map((input, i) => ({ input, left: i * 256, top: 0 }))),
);
for (let level = 1; level <= 2; level++) {
  const { image, width, height } = await trim(await source(`level-${level}`));
  const scale = Math.min(336 / width, 380 / height),
    w = Math.round(width * scale),
    h = Math.round(height * scale);
  const base = await canvas(384, 512)
    .composite([
      {
        input: await image.resize(w, h).png().toBuffer(),
        left: Math.round((384 - w) / 2),
        top: 476 - h,
      },
    ])
    .png()
    .toBuffer();
  await save(`level-${level}-base`, sharp(base));
  const actor = await sharp(actors[0]).resize(144, 144).png().toBuffer();
  await save(
    `level-${level}-preview`,
    sharp(base).composite([{ input: actor, left: 120, top: 88 }]),
  );
}
const bomb = await trim(await source('death-bomb'));
await save('death-bomb', bomb.image.resize(192, 192, { fit: 'contain', background: '#00000000' }));
console.log(
  `Bomb Tower art ${check ? 'verified' : 'built'}: two bases/previews, four Bomber poses, one death bomb.`,
);
