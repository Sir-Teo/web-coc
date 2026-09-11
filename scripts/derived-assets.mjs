// Derives the air-layer and spell artwork from the existing shipped source art.
// Every output is a deterministic transform of art/source material already in the
// repository: no image service, no network, no runtime AI. Re-running produces
// byte-identical files, so the asset checksums in output/ stay meaningful.
import sharp from 'sharp';
import fs from 'node:fs/promises';

const BUILD = 'public/assets/buildings';
const CHARS = 'public/assets/characters';
await fs.mkdir(`${BUILD}/tier3`, { recursive: true });
await fs.mkdir(`${CHARS}/walk`, { recursive: true });

const webp = { quality: 90, effort: 6 };

/** Air Defense: the mortar's up-angled barrel recoloured to cold anti-air steel. */
for (const [src, dest] of [
  [`${BUILD}/mortar.webp`, `${BUILD}/airdefense.webp`],
  [`${BUILD}/tier3/mortar.webp`, `${BUILD}/tier3/airdefense.webp`],
])
  await sharp(src)
    .modulate({ hue: 190, saturation: 1.3, brightness: 1.04 })
    .webp(webp)
    .toFile(dest);

/** Spell Factory: the laboratory recoloured to the arcane magenta of brewed spells. */
for (const [src, dest] of [
  [`${BUILD}/laboratory.webp`, `${BUILD}/spellfactory.webp`],
  [`${BUILD}/tier3/laboratory.webp`, `${BUILD}/tier3/spellfactory.webp`],
])
  await sharp(src).modulate({ hue: 40, saturation: 1.18 }).webp(webp).toFile(dest);

/**
 * Balloon: the elixir storage sphere, recoloured warm and flipped so its metal
 * collar becomes the burner mount, hung over a drawn wicker basket.
 */
// The glass sphere and its crown, isolated from the stone base it normally sits on.
// The sphere's own bottom is occluded by that base, so the mask cuts it off square
// and the drawn burner ring below hides the seam.
const CROP = { left: 58, top: 28, width: 246, height: 222 };
const mask = (shapes) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CROP.width}" height="${CROP.height}" fill="#fff">${shapes}</svg>`,
  );
// A full-width dome over a narrower rounded body: balloon-shaped, and narrow enough
// below the shoulder to exclude the base posts painted in front of the sphere.
const GLASS =
  '<defs><clipPath id="dome"><rect x="0" y="0" width="246" height="142"/></clipPath></defs>' +
  '<ellipse cx="123" cy="168" rx="121" ry="94" clip-path="url(#dome)"/>' +
  '<rect x="26" y="126" width="192" height="96" rx="38"/>';
const CROWN = '<rect x="76" y="2" width="100" height="92" rx="16"/>';

const cropped = await sharp(`${BUILD}/elixirstorage.webp`).extract(CROP).png().toBuffer();
// Recolour the glass alone so the gold fittings stay gold.
const glass = await sharp(
  await sharp(cropped).modulate({ hue: 80, saturation: 1.35, brightness: 1.06 }).png().toBuffer(),
)
  .composite([{ input: mask(GLASS), blend: 'dest-in' }])
  .png()
  .toBuffer();
const ENVELOPE_W = 240;
const envelope = await sharp(
  await sharp(
    await sharp(cropped)
      .composite([{ input: glass }])
      .png()
      .toBuffer(),
  )
    .composite([{ input: mask(GLASS + CROWN), blend: 'dest-in' }])
    .png()
    .toBuffer(),
)
  .resize({ width: ENVELOPE_W })
  .png()
  .toBuffer();
const envelopeMeta = await sharp(envelope).metadata();

const rigging = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="460">
  <defs>
    <linearGradient id="wicker" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#b8812f"/><stop offset="0.55" stop-color="#88591f"/><stop offset="1" stop-color="#563713"/>
    </linearGradient>
    <linearGradient id="bomb" x1="0.3" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="#63615b"/><stop offset="1" stop-color="#232119"/>
    </linearGradient>
  </defs>
  <g stroke="#4a3517" stroke-width="7" stroke-linecap="round" fill="none">
    <path d="M152 230 L160 300"/><path d="M248 230 L240 300"/>
    <path d="M184 236 L186 300"/><path d="M216 236 L214 300"/>
  </g>
  <rect x="128" y="206" width="144" height="30" rx="13" fill="#6b4d24" stroke="#33230d" stroke-width="7"/>
  <rect x="140" y="212" width="120" height="8" rx="4" fill="#c39a4c" opacity="0.7"/>
  <rect x="148" y="294" width="104" height="70" rx="13" fill="url(#wicker)" stroke="#3f2910" stroke-width="8"/>
  <g stroke="#5e4019" stroke-width="5" opacity="0.8">
    <path d="M148 316 H252"/><path d="M148 340 H252"/>
    <path d="M174 296 V362"/><path d="M200 296 V362"/><path d="M226 296 V362"/>
  </g>
  <circle cx="200" cy="322" r="27" fill="url(#bomb)" stroke="#191710" stroke-width="6"/>
  <path d="M203 296 q11 -16 26 -19" stroke="#d8ae5a" stroke-width="7" fill="none" stroke-linecap="round"/>
  <circle cx="190" cy="313" r="7" fill="#8e8b83" opacity="0.6"/>
</svg>`;

// sharp runs trim/resize ahead of composite, so the layers are flattened first.
const assembled = await sharp({
  create: { width: 400, height: 460, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite([
    { input: Buffer.from(rigging), top: 0, left: 0 },
    { input: envelope, top: 6, left: Math.round((400 - envelopeMeta.width) / 2) },
  ])
  .png()
  .toBuffer();
await sharp(assembled)
  .trim({ background: '#00000000', threshold: 12 })
  .resize({ width: 300, height: 420, fit: 'inside' })
  .webp(webp)
  .toFile(`${CHARS}/balloon.webp`);

/**
 * Four-frame float cycle. The ground troops share a 512x128 walk sheet, so the
 * balloon uses the same layout with a bob and a small basket sway per frame.
 */
const portrait = await sharp(`${CHARS}/balloon.webp`).png().toBuffer();
const frames = [];
for (let i = 0; i < 4; i++) {
  const bob = [0, -3, 0, 3][i];
  const width = 96 + [0, 1, 0, -1][i];
  const frame = await sharp(portrait)
    .resize({ width, height: 112 - Math.abs(bob), fit: 'inside' })
    .png()
    .toBuffer();
  const meta = await sharp(frame).metadata();
  frames.push({
    input: frame,
    top: Math.max(0, 128 - meta.height - 6 + bob),
    left: i * 128 + Math.round((128 - meta.width) / 2),
  });
}
await sharp({
  create: { width: 512, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
})
  .composite(frames)
  .webp(webp)
  .toFile(`${CHARS}/walk/balloon.webp`);

await import('./spell-assets.mjs');

console.log('Derived air-layer and spell artwork from existing sources.');
