import sharp from 'sharp';
import fs from 'node:fs/promises';

// ImageGen supplies the eight designs on a cyan production matte. Convert that
// matte to alpha before resampling; a fixed frame keeps every foot anchored.
const source = 'art/source/walls-levels-v1-chroma.png';
const { data, info } = await sharp(source)
  .removeAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });
if (info.width !== 1536 || info.height !== 1024)
  throw new Error('Unexpected wall atlas dimensions');
const rgba = Buffer.alloc(info.width * info.height * 4);
for (let i = 0; i < info.width * info.height; i++) {
  const r = data[i * 3],
    g = data[i * 3 + 1],
    b = data[i * 3 + 2];
  // Cyan is absent from wood, neutral stone/metal, gold, magenta and violet.
  const key = Math.max(0, Math.min(g, b) - r - 25);
  const alpha = Math.max(0, Math.min(1, 1 - key / 170));
  rgba[i * 4] = r;
  rgba[i * 4 + 1] = Math.max(0, g - key);
  rgba[i * 4 + 2] = Math.max(0, b - key);
  rgba[i * 4 + 3] = Math.round(alpha * 255);
}
const atlas = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } })
  .png()
  .toBuffer();
await fs.mkdir('public/assets/environment/walls-v1', { recursive: true });
for (let level = 1; level <= 8; level++) {
  const cell = await sharp(atlas)
    .extract({
      left: ((level - 1) % 4) * 384,
      top: Math.floor((level - 1) / 4) * 512,
      width: 384,
      height: 512,
    })
    .png()
    .toBuffer();
  const sprite = await sharp(cell)
    .trim({ background: '#00000000', threshold: 8 })
    .resize({ width: 174, height: 236, fit: 'inside' })
    .png()
    .toBuffer();
  const meta = await sharp(sprite).metadata();
  const frame = await sharp({
    create: { width: 192, height: 256, channels: 4, background: '#00000000' },
  })
    .composite([
      { input: sprite, left: Math.floor((192 - meta.width) / 2), top: 246 - meta.height },
    ])
    .raw()
    .toBuffer();
  // Resampling can amplify matte colour in barely visible edge pixels. Remove
  // that residual cyan after alignment, preserving neutral and warm material pixels.
  for (let i = 0; i < frame.length; i += 4) {
    const spill = Math.max(0, Math.min(frame[i + 1], frame[i + 2]) - frame[i] - 30);
    frame[i + 1] -= spill;
    frame[i + 2] -= spill;
    if (!frame[i + 3]) frame[i] = frame[i + 1] = frame[i + 2] = 0;
  }
  await sharp(frame, { raw: { width: 192, height: 256, channels: 4 } })
    .webp({ lossless: true })
    .toFile(`public/assets/environment/walls-v1/level-${level}.webp`);
}
console.log('Eight wall levels built with transparent, aligned 192×256 frames.');
