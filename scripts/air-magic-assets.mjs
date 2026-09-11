import sharp from 'sharp';
import fs from 'node:fs/promises';

// Original generated sources are kept separately from the earlier derived art.
// Rebuilds only normalize and encode these accepted RGBA originals; no network.
const sources = 'art/source/air-magic-v2';
const webp = { quality: 90, alphaQuality: 100, effort: 6 };
const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

async function sprite(name, destination, width, height) {
  const input = `${sources}/${name}.png`;
  const stats = await sharp(input).stats();
  if (stats.channels.length !== 4 || stats.channels[3].min !== 0)
    throw new Error(`${input} must have genuine transparency, not a painted background.`);
  await sharp(input)
    .trim({ background: '#00000000', threshold: 10 })
    .resize({ width, height, fit: 'inside' })
    .webp(webp)
    .toFile(destination);
}

await fs.mkdir('public/assets/buildings/tier3', { recursive: true });
await fs.mkdir('public/assets/characters/walk', { recursive: true });
for (const kind of ['airdefense', 'spellfactory']) {
  await sprite(kind, `public/assets/buildings/${kind}-v2.webp`, 400, 480);
  await sprite(`${kind}-tier3`, `public/assets/buildings/tier3/${kind}-v2.webp`, 400, 480);
}
await sprite('balloon', 'public/assets/characters/balloon-v2.webp', 360, 440);

// One shared scale in every frame avoids a pulsing/stretching envelope. The
// continuous float is rendered in the scene; the atlas gives it a gentle sway.
const balloon = await sharp('public/assets/characters/balloon-v2.webp')
  .resize({ width: 98, height: 110, fit: 'inside' })
  .png()
  .toBuffer();
const size = await sharp(balloon).metadata();
const frames = [0, 1, 0, -1].map((sway, i) => ({
  input: balloon,
  left: i * 128 + Math.floor((128 - size.width) / 2) + sway,
  top: 122 - size.height,
}));
await sharp({ create: { width: 512, height: 128, channels: 4, background: transparent } })
  .composite(frames)
  .webp(webp)
  .toFile('public/assets/characters/walk/balloon-v2.webp');
console.log('Built six original air/magic sprites with genuine alpha and stable animation scale.');
