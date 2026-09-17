import sharp from 'sharp';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const kinds = ['queen', 'warden', 'champion', 'prince', 'duke'];
const source = 'art/source/hero-redesign-v1';
const output = 'public/assets/characters/hero-redesign-v1';
const check = process.argv.includes('--check');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifest = { generator: 'Built-in imagegen', columns: 6, rows: 4, characters: {} };
async function emit(path, bytes) {
  if (check) {
    if (!bytes.equals(await fs.readFile(path))) throw Error(`${path} is stale`);
  } else {
    await fs.mkdir(path.slice(0, path.lastIndexOf('/')), { recursive: true });
    await fs.writeFile(path, bytes);
  }
}
for (const kind of kinds) {
  const file = `${source}/${kind}-generated.png`;
  const bytes = await fs.readFile(file);
  const meta = await sharp(bytes).metadata();
  if (meta.width !== 1536 || meta.height !== 1024 || !meta.hasAlpha)
    throw Error(`${kind}: expected 6 x 4 RGBA cells`);
  const layers = [];
  const anchors = [];
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 6; col++) {
      const crop = await sharp(bytes)
        .extract({ left: col * 256, top: row * 256, width: 256, height: 256 })
        .png()
        .toBuffer();
      const { data } = await sharp(crop).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let bottom = 0;
      for (let y = 0; y < 256; y++)
        for (let x = 0; x < 256; x++)
          if (data[(y * 256 + x) * 4 + 3] > 128) bottom = Math.max(bottom, y);
      // Preserve one scale for the entire sheet and a fixed pelvis x. Register the
      // feet (hovering claws for flyers), never the extremity of a swinging weapon.
      const scale = 0.82;
      anchors.push({ row, col, x: 128, y: bottom });
      const resized = await sharp(crop).resize(210, 210).png().toBuffer();
      const registered = await sharp({
        create: { width: 256, height: 256, channels: 4, background: '#00000000' },
      })
        .composite([{ input: resized, left: 23, top: 216 - Math.round(bottom * scale) }])
        .png()
        .toBuffer();
      layers.push({ input: registered, left: col * 256, top: row * 256 });
      if (!row && !col) {
        const portrait = await sharp(crop)
          .trim({ background: '#00000000', threshold: 12 })
          .resize({ width: 356, height: 416, fit: 'inside' })
          .webp({ lossless: true, effort: 6 })
          .toBuffer();
        await emit(`${output}/${kind}/portrait.webp`, portrait);
      }
    }
  const sheet = await sharp({
    create: { width: 1536, height: 1024, channels: 4, background: '#00000000' },
  })
    .composite(layers)
    .webp({ lossless: true, effort: 6 })
    .toBuffer();
  await emit(`${output}/${kind}/poses.webp`, sheet);
  const frame = (row, col) => ({
    image: 'poses.webp',
    x: col * 256,
    y: row * 256,
    w: 256,
    h: 256,
    anchorX: 128,
    anchorY: 216,
  });
  // Runtime direction order: E, SE, S, SW, W, NW, N, NE. Four authored
  // quarters are reused without mirroring weapons, shields or costume sides.
  const rows = [1, 1, 0, 0, 2, 2, 3, 3];
  const state = (cols, fps, loop = true) => ({
    fps,
    loop,
    frames: rows.map((row) => cols.map((col) => frame(row, col))),
  });
  const atlas = {
    scale: kind === 'duke' ? 0.43 : kind === 'prince' ? 0.39 : 0.36,
    normalizedAttack: true,
    states: {
      idle: state([0], 1),
      walk: state([1, 0, 2, 0], 7),
      attack: state([4, 5, 0, 0, 0, 3], 6),
      die: state([5], 1, false),
    },
  };
  await emit(`${output}/${kind}/atlas.json`, Buffer.from(JSON.stringify(atlas) + '\n'));
  manifest.characters[kind] = {
    source: file,
    sha256: sha(bytes),
    sheetSha256: sha(sheet),
    anchors,
  };
  console.log(`${check ? 'Verified' : 'Built'} ${kind}: 24 registered poses and portrait`);
}
await emit(`${source}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2) + '\n'));

// Reuse the approved King artwork rather than introducing a second King identity.
const kingRows = [
  'front-right',
  'front-right',
  'front-left',
  'front-left',
  'back-left',
  'back-left',
  'back-right',
  'back-right',
];
const kingState = (cols, fps, loop = true) => ({
  fps,
  loop,
  frames: kingRows.map((dir) =>
    cols.map((col) => ({
      image: `${dir}.webp`,
      x: col * 256,
      y: 0,
      w: 256,
      h: 256,
      anchorX: 128,
      anchorY: 216,
    })),
  ),
});
await emit(
  'public/assets/characters/king-v1/atlas.json',
  Buffer.from(
    JSON.stringify({
      scale: 88 / 256,
      normalizedAttack: true,
      states: {
        idle: kingState([0], 1),
        walk: kingState([1, 2, 3, 4], 6.25),
        attack: kingState([6, 7, 8, 0, 0, 5], 6),
        die: kingState([8], 1, false),
      },
    }) + '\n',
  ),
);
