import sharp from 'sharp';
import fs from 'node:fs/promises';

const check = process.argv.includes('--check');
// Reviewed body centers within each 627px source cell. Wing silhouettes must
// not move the torso or change its scale through the animation.
const centers = { healer: 380, dragon: 350, pekka: 320 };
for (const [kind, bodyX] of Object.entries(centers)) {
  const source = `art/source/late-troops-v1/${kind}.png`;
  const meta = await sharp(source).metadata();
  const stats = await sharp(source).stats();
  if (meta.width !== 1254 || meta.height !== 1254 || !meta.hasAlpha || stats.channels[3].min !== 0)
    throw Error(`${source}: expected the reviewed 1254px transparent sheet.`);
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const raw = await sharp(source)
      .extract({ left: (i % 2) * 627, top: Math.floor(i / 2) * 627, width: 627, height: 627 })
      .raw()
      .toBuffer();
    let left = 627,
      top = 627,
      right = 0,
      bottom = 0;
    for (let y = 0; y < 627; y++)
      for (let x = 0; x < 627; x++) {
        if (raw[(y * 627 + x) * 4 + 3] > 10) {
          left = Math.min(left, x);
          top = Math.min(top, y);
          right = Math.max(right, x);
          bottom = Math.max(bottom, y);
        }
      }
    const width = right - left + 1,
      height = bottom - top + 1;
    const cell = await sharp(raw, { raw: { width: 627, height: 627, channels: 4 } })
      .extract({ left, top, width, height })
      .png()
      .toBuffer();
    frames.push({ cell, width, height, anchorX: bodyX - left });
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
    .resize({ width: 356, height: 436, fit: 'contain', background: '#00000000' })
    .extend({ top: 2, right: 2, bottom: 2, left: 2, background: '#00000000' })
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  for (const [path, bytes] of [
    [`public/assets/characters/walk/${kind}-v1.webp`, atlas],
    [`public/assets/characters/${kind}-v1.webp`, portrait],
  ]) {
    if (check) {
      if (!bytes.equals(await fs.readFile(path))) throw Error(`${path}: rebuild differs.`);
    } else await fs.writeFile(path, bytes);
    console.log(`${check ? 'Verified' : 'Built'} ${path}: ${bytes.length} bytes`);
  }
}
