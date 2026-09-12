import sharp from 'sharp';
import fs from 'node:fs/promises';

const check = process.argv.includes('--check');
const source = 'art/source/king-v1';
const out = 'public/assets/characters/king-v1';
// Measured pelvis/ground registrations in the reviewed 418px source cells.
// Sword tips do not define the foot plane, and a swinging arm never recenters a pose.
const anchors = {
  'front-left': [
    [224, 380],
    [206, 380],
    [190, 380],
    [224, 368],
    [206, 365],
    [208, 370],
    [277, 320],
    [245, 325],
    [218, 338],
  ],
  'front-right': [
    [223, 380],
    [210, 385],
    [206, 380],
    [224, 355],
    [215, 355],
    [224, 362],
    [245, 305],
    [230, 308],
    [240, 326],
  ],
  'back-left': [
    [226, 378],
    [225, 380],
    [225, 380],
    [227, 350],
    [227, 355],
    [236, 365],
    [265, 310],
    [260, 315],
    [265, 335],
  ],
  'back-right': [
    [227, 380],
    [225, 380],
    [225, 380],
    [227, 365],
    [227, 355],
    [227, 365],
    [227, 335],
    [227, 335],
    [260, 335],
  ],
};

async function unmatte(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let p = 0; p < data.length; p += 4) {
    const excess = Math.min(data[p], data[p + 2]) - data[p + 1];
    if (excess > 45 && data[p] > data[p + 1] * 1.4) {
      data[p + 3] = Math.round(255 * Math.max(0, 1 - excess / 180));
      data[p] = Math.min(data[p], data[p + 1] + 35);
      data[p + 2] = Math.min(data[p + 2], data[p + 1] + 35);
    } else if (excess > 20) {
      data[p] = Math.min(data[p], data[p + 1] + 20);
      data[p + 2] = Math.min(data[p + 2], data[p + 1] + 20);
    }
  }
  return { png: await sharp(data, { raw: info }).png().toBuffer(), ...info };
}
async function removeFilteredSpill(png) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Lanczos filtering can reintroduce a few colored edge pixels from the matte.
  for (let p = 0; p < data.length; p += 4) {
    if (Math.min(data[p], data[p + 2]) - data[p + 1] > 20) {
      data[p] = Math.min(data[p], data[p + 1] + 20);
      data[p + 2] = Math.min(data[p + 2], data[p + 1] + 20);
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}
async function emit(name, bytes) {
  const path = `${out}/${name}.webp`;
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} differs from source`);
  } else await fs.writeFile(path, bytes);
  console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
}
if (!check) await fs.mkdir(out, { recursive: true });
const attack = await unmatte(`${source}/back-right-attack.png`);
if (attack.width !== 2172 || attack.height !== 724)
  throw Error('Unexpected rear attack source dimensions');
for (const [direction, points] of Object.entries(anchors)) {
  const sheet = await unmatte(`${source}/${direction}.png`);
  if (sheet.width !== 1254 || sheet.height !== 1254)
    throw Error(`Unexpected ${direction} source dimensions`);
  const layers = [];
  for (let i = 0; i < 9; i++) {
    const replacement = direction === 'back-right' && i >= 5 && i <= 7;
    const input = replacement ? attack.png : sheet.png;
    const size = replacement ? 724 : 418;
    const widerRow = direction === 'front-right' && i >= 6;
    const cuts = widerRow ? [0, 460, 880, 1254] : [0, 418, 836, 1254];
    const left = replacement ? (i - 5) * size : cuts[i % 3];
    const width = replacement ? size : cuts[(i % 3) + 1] - left;
    const top = replacement ? 0 : Math.floor(i / 3) * size;
    // The rejected rear-right strike crosses the source row by a few pixels.
    // Cut that incoming blade fleck out of the preceding walking cell's gutter.
    const height = direction === 'back-right' && i === 3 ? 410 : size;
    const crop = await sharp(input).extract({ left, top, width, height }).png().toBuffer();
    const scale = replacement ? 0.3 : direction === 'back-left' ? 0.51 : 0.53;
    const [rawAnchorX, baseline] = replacement
      ? [
          [424, 668],
          [420, 668],
          [420, 668],
        ][i - 5]
      : points[i];
    const anchorX = rawAnchorX - (widerRow ? left - (i % 3) * 418 : 0);
    const resized = await sharp(crop)
      .resize(Math.round(width * scale), Math.round(height * scale))
      .png()
      .toBuffer();
    // Composite a whole registered source cell before cropping to the runtime cell.
    const x = 128 - Math.round(anchorX * scale),
      y = 216 - Math.round(baseline * scale);
    const registered = await sharp({
      create: { width: 600, height: 600, channels: 4, background: '#00000000' },
    })
      .composite([{ input: await removeFilteredSpill(resized), left: 150 + x, top: 150 + y }])
      .png()
      .toBuffer();
    const canvas = await sharp(registered)
      .extract({ left: 150, top: 150, width: 256, height: 256 })
      .png()
      .toBuffer();
    layers.push({ input: canvas, left: i * 256, top: 0 });
    if (direction === 'front-left' && i === 0) {
      await emit(
        'portrait',
        await sharp(crop)
          .trim({ background: '#00000000', threshold: 8 })
          .resize({ width: 356, height: 416, fit: 'inside' })
          .extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#00000000' })
          .webp({ lossless: true, effort: 6 })
          .toBuffer(),
      );
    }
  }
  await emit(
    direction,
    await sharp({ create: { width: 2304, height: 256, channels: 4, background: '#00000000' } })
      .composite(layers)
      .webp({ lossless: true, effort: 6 })
      .toBuffer(),
  );
}
console.log(
  '36 registered poses: idle, four walking frames, windup, strike, follow-through, recovery.',
);
