import sharp from 'sharp';
import fs from 'node:fs/promises';

// Retain the generated matte so shipping assets can be rebuilt without ImageGen.
const source = 'art/source/barbarian-v1/walk-matte.png';
const check = process.argv.includes('--check');
const rgba = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (rgba.info.width !== 1254 || rgba.info.height !== 1254)
  throw Error('The Barbarian import expects the reviewed 1254px source sheet.');
for (let p = 0; p < rgba.data.length; p += 4) {
  const d = rgba.data;
  const excess = Math.min(d[p], d[p + 2]) - d[p + 1];
  // The character has no magenta materials. Remove the generated chroma matte
  // and neutralize blended edge spill before filtering down to game resolution.
  if (excess > 45 && d[p] > d[p + 1] * 1.4) {
    d[p + 3] = Math.round(255 * Math.max(0, 1 - excess / 180));
    d[p] = Math.min(d[p], d[p + 1] + 35);
    d[p + 2] = Math.min(d[p + 2], d[p + 1] + 35);
  } else if (excess > 20) {
    d[p] = Math.min(d[p], d[p + 1] + 20);
    d[p + 2] = Math.min(d[p + 2], d[p + 1] + 20);
  }
}
const cutout = await sharp(rgba.data, { raw: rgba.info }).png().toBuffer();
// Measured gutters; the first figure's wrist extends beyond the nominal center.
const xs = [0, 650, 1254],
  ys = [0, 620, 1254];
const frames = [];
for (let i = 0; i < 4; i++) {
  const x = i % 2,
    y = Math.floor(i / 2);
  const crop = await sharp(cutout)
    .extract({ left: xs[x], top: ys[y], width: xs[x + 1] - xs[x], height: ys[y + 1] - ys[y] })
    .png()
    .toBuffer();
  const cell = await sharp(crop).trim({ background: '#00000000', threshold: 8 }).png().toBuffer();
  const { data, info } = await sharp(cell).raw().toBuffer({ resolveWithObject: true });
  let mass = 0,
    weightedX = 0;
  // Register the yellow hair rather than the swinging arm, sword or leading foot.
  for (let y = 0; y < Math.floor(info.height * 0.22); y++)
    for (let x = 0; x < info.width; x++) {
      const p = (y * info.width + x) * 4;
      if (data[p + 3] > 200 && data[p] > 150 && data[p + 1] > 100 && data[p + 2] < 100) {
        mass++;
        weightedX += x;
      }
    }
  if (!mass) throw Error(`Barbarian frame ${i} has no hair registration pixels.`);
  frames.push({ cell, width: info.width, height: info.height, anchorX: weightedX / mass });
}
const scale = Math.min(
  58 / Math.max(...frames.map((f) => f.anchorX)),
  58 / Math.max(...frames.map((f) => f.width - f.anchorX)),
  116 / Math.max(...frames.map((f) => f.height)),
);
const layers = await Promise.all(
  frames.map(async (f, i) => {
    const width = Math.round(f.width * scale),
      height = Math.round(f.height * scale);
    return {
      input: await sharp(f.cell).resize(width, height).png().toBuffer(),
      left: i * 128 + 64 - Math.round(f.anchorX * scale),
      top: 122 - height,
    };
  }),
);
const atlas = await sharp({
  create: { width: 512, height: 128, channels: 4, background: '#00000000' },
})
  .composite(layers)
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
const portrait = await sharp(frames[1].cell)
  .resize({ width: 356, height: 416, fit: 'inside' })
  .extend({ top: 2, right: 2, bottom: 2, left: 2, background: '#00000000' })
  .webp({ lossless: true, effort: 6 })
  .toBuffer();
for (const [path, bytes] of [
  ['public/assets/characters/walk/barbarian-v1.webp', atlas],
  ['public/assets/characters/barbarian-v1.webp', portrait],
]) {
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} differs from its source.`);
  } else await fs.writeFile(path, bytes);
  console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
}
console.log(
  `Four shared-scale frames (${scale.toFixed(4)}), hair centered at 64px, foot baseline 122px.`,
);
