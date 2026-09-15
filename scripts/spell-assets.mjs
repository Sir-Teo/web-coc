import sharp from 'sharp';
import fs from 'node:fs/promises';

// Original SVG glassware. Palette references: docs/SPELL-PROGRESSION.md.
const SPELLS = 'public/assets/spells';
await fs.mkdir(SPELLS, { recursive: true });

/** Spell vials, drawn to match the glassware already on the laboratory. */
const vial = (
  id,
  liquid,
  dark,
  glyph,
) => `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <defs>
    <linearGradient id="l${id}" x1="0.2" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="${liquid}"/><stop offset="1" stop-color="${dark}"/>
    </linearGradient>
    <linearGradient id="g${id}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="0.35" stop-color="#ffffff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0.25"/>
    </linearGradient>
  </defs>
  <path d="M96 44 h64 v42 l40 62 a56 56 0 0 1 -144 0 l40 -62 z" fill="url(#l${id})" stroke="#2f2618" stroke-width="9" stroke-linejoin="round"/>
  <path d="M96 44 h64 v42 l40 62 a56 56 0 0 1 -144 0 l40 -62 z" fill="url(#g${id})"/>
  <rect x="86" y="26" width="84" height="30" rx="10" fill="#c99a4e" stroke="#5d431c" stroke-width="8"/>
  <ellipse cx="128" cy="168" rx="46" ry="16" fill="#ffffff" opacity="0.16"/>
  <g fill="#fff8dd" opacity="0.92">${glyph}</g>
</svg>`;

const glyphs = {
  rage: ['#cf79ef', '#7836ac', '<path d="M138 122 l-34 46 h24 l-10 40 l38 -52 h-24 z"/>'],
  heal: [
    '#fff49d',
    '#d6a934',
    '<path d="M118 128 h20 v22 h22 v20 h-22 v22 h-20 v-22 h-22 v-20 h22 z"/>',
  ],
  lightning: ['#6fd4ff', '#1d5d97', '<path d="M144 116 l-40 54 h22 l-6 42 l42 -58 h-22 z"/>'],
  // Paler and colder than the Lightning vial, so the two read apart in the tray at a glance.
  freeze: [
    '#e2f6ff',
    '#4f96c8',
    '<path d="M124 116 h8 v20 l16 -10 l4 7 l-20 12 l20 12 l-4 7 l-16 -10 v20 h-8 v-20 l-16 10 l-4 -7 l20 -12 l-20 -12 l4 -7 l16 10 z"/>',
  ],
};
for (const [name, [liquid, dark, glyph]] of Object.entries(glyphs)) {
  const output = `${SPELLS}/${name}-v2.webp`;
  const bytes = await sharp(Buffer.from(vial(name, liquid, dark, glyph)))
    .resize(256, 256)
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  if (process.argv.includes('--check')) {
    if (!(await fs.readFile(output)).equals(bytes)) throw Error(`${output} needs regeneration.`);
  } else await fs.writeFile(output, bytes);
}
console.log(`Verified ${Object.keys(glyphs).length} spell vials against their native palettes.`);
