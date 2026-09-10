import sharp from 'sharp';
import fs from 'node:fs/promises';
const input = 'art/source/walk-final.png';
const meta = await sharp(input).metadata();
if (!meta.hasAlpha) throw Error('Animation sheet must have real alpha');
const names = ['swordsman', 'archer', 'giant', 'wizard'];
const xs = [0, 313, 627, 940, 1254],
  ys = [0, 307, 606, 932, 1254];
await fs.mkdir('public/assets/characters/walk', { recursive: true });
for (let row = 0; row < 4; row++) {
  const frames = [];
  for (let col = 0; col < 4; col++) {
    const buf = await sharp(input)
      .extract({
        left: xs[col],
        top: ys[row],
        width: xs[col + 1] - xs[col],
        height: ys[row + 1] - ys[row],
      })
      .toBuffer();
    const trimmed = await sharp(buf).trim({ background: '#00000000', threshold: 40 }).toBuffer();
    const metadata = await sharp(trimmed).metadata();
    frames.push({ buf: trimmed, w: metadata.width, h: metadata.height });
  }
  const scale = Math.min(
    112 / Math.max(...frames.map((v) => v.w)),
    116 / Math.max(...frames.map((v) => v.h)),
  );
  const composite = [];
  for (let col = 0; col < 4; col++) {
    const f = frames[col],
      w = Math.round(f.w * scale),
      h = Math.round(f.h * scale);
    composite.push({
      input: await sharp(f.buf).resize(w, h).toBuffer(),
      left: col * 128 + Math.round((128 - w) / 2),
      top: 122 - h,
    });
  }
  await sharp({ create: { width: 512, height: 128, channels: 4, background: '#00000000' } })
    .composite(composite)
    .webp({ quality: 90 })
    .toFile(`public/assets/characters/walk/${names[row]}.webp`);
  await sharp(frames[0].buf)
    .resize({ width: 360, height: 420, fit: 'inside' })
    .webp({ quality: 90 })
    .toFile(`public/assets/characters/${names[row]}.webp`);
}
console.log(
  'Four normalized walk cycles, 128px frames, shared per-character scale and foot anchor.',
);
