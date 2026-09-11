import sharp from 'sharp';
import fs from 'node:fs/promises';

const output = 'public/assets/characters/walk';
await fs.mkdir(output, { recursive: true });
const check = process.argv.includes('--check');
for (const kind of ['goblin', 'wallbreaker']) {
  const source = `art/source/specialist-walk-v1/${kind}.png`;
  const meta = await sharp(source).metadata();
  const stats = await sharp(source).stats();
  if (!meta.hasAlpha || stats.channels[3].min !== 0)
    throw new Error(`${source}: the source must contain real transparent alpha.`);
  const frames = [];
  for (let i = 0; i < 4; i++) {
    const x = i % 2,
      y = Math.floor(i / 2);
    const left = Math.floor((meta.width * x) / 2),
      top = Math.floor((meta.height * y) / 2);
    const cropped = await sharp(source)
      .extract({
        left,
        top,
        width: Math.floor((meta.width * (x + 1)) / 2) - left,
        height: Math.floor((meta.height * (y + 1)) / 2) - top,
      })
      .png()
      .toBuffer();
    const cell = await sharp(cropped)
      .trim({ background: '#00000000', threshold: 10 })
      .png()
      .toBuffer();
    const size = await sharp(cell).metadata();
    const raw = await sharp(cell).ensureAlpha().raw().toBuffer();
    let mass = 0,
      weightedX = 0;
    // Register the upper body, not the changing silhouette of a stretched leg.
    for (let cy = 0; cy < Math.floor(size.height * 0.55); cy++)
      for (let cx = 0; cx < size.width; cx++) {
        const alpha = raw[(cy * size.width + cx) * 4 + 3];
        if (alpha < 16) continue;
        mass += alpha;
        weightedX += cx * alpha;
      }
    if (!mass) throw new Error(`${source}: frame ${i} has no visible upper body.`);
    frames.push({ cell, width: size.width, height: size.height, anchorX: weightedX / mass });
  }
  // One scale per character; a wider stride must not shrink the head or bomb.
  const scale = Math.min(
    52 / Math.max(...frames.map((f) => f.anchorX)),
    52 / Math.max(...frames.map((f) => f.width - f.anchorX)),
    116 / Math.max(...frames.map((f) => f.height)),
  );
  const layers = [];
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const width = Math.round(frame.width * scale),
      height = Math.round(frame.height * scale);
    layers.push({
      input: await sharp(frame.cell).resize(width, height).png().toBuffer(),
      left: i * 128 + 64 - Math.round(frame.anchorX * scale),
      top: 122 - height,
    });
  }
  const atlas = await sharp({
    create: { width: 512, height: 128, channels: 4, background: '#00000000' },
  })
    .composite(layers)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  const path = `${output}/${kind}-v1.webp`;
  if (check) {
    if (!atlas.equals(await fs.readFile(path))) throw new Error(`${path}: rebuild differs.`);
  } else await fs.writeFile(path, atlas);
  console.log(
    `${kind}: four RGBA frames, shared scale ${scale.toFixed(4)}, ${atlas.length} bytes${check ? ', rebuild verified' : ''}`,
  );
}
