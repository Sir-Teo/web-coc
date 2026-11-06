# Pinned native English HUD fonts

Client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The original `sc/hud.sc` names **Supercell-Magic** in 18 text fields and
**CCBackBeat Light** in seven. The `EN` locale declares neither a forced font nor
a system-font override. These source rows and file pins are retained in
[native.json](native.json).

The app uses the bundle's `Supercell-Magic_5.ttf` and `CCBackBeat-Light_5.ttf` for
these families. Their complete originals live under `art/source/native-fonts/`;
they retain their original names and metadata. The archive also contains an older
Magic face and a large Korean text face. The HUD evidence establishes the family
names; it does not map every text field to a particular duplicate font revision.

| Role    | CSS family     | Source glyphs |  Original TTF |              Full WOFF2 |
| ------- | -------------- | ------------: | ------------: | ----------------------: |
| Heading | Clash Headline |           447 | 110,588 bytes | See the generated index |
| Text    | Clash Text     |           339 |  90,376 bytes | See the generated index |

The two WOFF2 files total **77,880 bytes**, compared with 200,964 source TTF bytes.
Encoding retains every glyph, Unicode map, advance, bearing, outline and hint.
WOFF2 normalizes the header checksum and lossless-compression flag; other header
bytes and non-transformed SFNT tables remain byte-identical. The glyph/loca and optional
horizontal-metric transforms are checked through their complete decoded geometry,
instructions and metrics. Source timestamps are retained for deterministic output.
No language subset is applied.

`src/ui/native-fonts.css` declares each face at its source weight. CSS scales the
heading face to 72% of the existing HUD's nominal sizes so the wider native glyphs
fit the action buttons. Text stays at 100%. DOM headings, body text and the two
floating action/collection labels use these families. The original glyph data
stays unchanged. Other CSS sizes, strokes and layout remain local presentation;
this is not a reconstruction of every native SC text-field transform.

Font preloads start with the document; `font-display: swap` keeps controls readable
with system fallbacks during loading or a failed download. The game does not wait
for font downloads to advance combat. Production's existing boot-resource capture
warms the font files for offline use. The previous substitute font packages are
no longer required.

## Rebuild and checks

```sh
output/native-art-venv/bin/pip install -r scripts/native_art/requirements.txt
PYTHONPATH=scripts OPENBLAS_NUM_THREADS=1 output/native-art-venv/bin/python scripts/import-native-fonts.py --check
npx vitest run tests/native-fonts.test.ts
npx playwright test tests/browser/native-fonts.spec.ts tests/browser/hud-layout.spec.ts
```

The importer checks both source checksums and fingerprint membership. FontTools
4.61.1 and Brotli 1.2.0 are pinned. It verifies a complete round-trip witness of
all 786 glyphs, maps, metrics, instructions and retained tables. The browser
compares every mapped glyph and a kerning sample against the original TTF at
three sizes, including the same CSS size adjustment. Native HUD checks cover
readable action labels, font loading and menus; neighboring layout checks cover
38 starter/developed viewport combinations and touch rotation.

The production release check verifies both loaded font faces and the cached WOFF2
checksums, then repeats the check after an offline reload:

```sh
npm run build
PRODUCTION_BROWSER=chromium npm run test:production
```
