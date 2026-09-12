# Blacksmith artwork and exact prompts

Created using the built-in `image_gen` tool. The source provenance and reference URLs are in [provenance.json](provenance.json). These are generated recreations; they do not establish pixel identity with the native game.

## Shipped files

- `public/assets/buildings/blacksmith.webp` — 167046 bytes
- `public/assets/equipment/boots-v1.webp` — 50386 bytes
- `public/assets/equipment/glowy-v1.webp` — 50052 bytes
- `public/assets/equipment/puppet-v1.webp` — 57174 bytes
- `public/assets/equipment/shiny-v1.webp` — 42432 bytes
- `public/assets/equipment/starry-v1.webp` — 33178 bytes
- `public/assets/equipment/vial-v1.webp` — 46634 bytes

Regenerate or verify with `node scripts/blacksmith-assets.mjs` / `node scripts/blacksmith-assets.mjs --check`. All files retain real alpha. The building uses generated alpha; the icon sheet uses the generated green matte, followed by keying, despill and registration.

## Building

```text
Use case: stylized-concept
Asset type: transparent isometric village building sprite for a Clash of Clans clone.
Primary request: recreate the referenced level-one Blacksmith as a clean game sprite viewed from above at the standard Clash of Clans isometric camera, looking down approximately 30 degrees, showing front and right side. Match the reference's teal timber pitched awning roof, chunky grey chimney, tan stone central furnace, dark brown structural posts, grey anvil on its wooden pedestal at the front, leaning metal hammer at front-left, red metal-banded toolbox at right, and flat grey stone paving base. Preserve the compact roofless front workshop silhouette and exact material/color identities. Only change the camera from the low promotional view to the in-game elevated view.
Style: polished chunky Supercell-style 3D render, crisp readable bevels, restrained wood grain, warm sunlight from upper left, soft ambient occlusion. Sharp silhouette readable at 140 pixels wide.
Composition: square 1024x1024 canvas, building centered, entire chimney and base fit inside with generous transparent margins; base centered horizontally, bottom of base at 88% canvas height.
Background: genuine transparent alpha, no colored backdrop, no ground outside the paving, no labels, no letters, no watermark, no additional buildings, no characters.
```

## Icon sheet

```text
Use case: stylized-concept
Asset type: six transparent game UI inventory icons in a rigid 3-column by 2-row sprite sheet, landscape 1536x1024.
Primary request: create high-resolution reference-faithful Clash of Clans equipment and ore icons. Use references 1–3 for the top row's equipment. References 4–5 show Glowy Ore and Starry Ore in the bottom row. Shiny Ore is a simple cyan-blue faceted nugget. Top-left: Barbarian Puppet, a little beige woven sack doll with round googly eyes, yellow hair and mustache, red belt with square metal buckle, brown skirt, tiny grey sword in its left side, both arms raised. Top-middle: Rage Vial, diagonally tilted faceted glass bottle with bright purple elixir, angular grey metal collar, tan cork and a short dark chain at the upper-left. Top-right: Earthquake Boots, pair of chunky brown boots with thick gold cuffs, golden armored toes and square gold buckles. Bottom-left: Shiny Ore, a chunky faceted cyan-blue nugget. Bottom-middle: Glowy Ore, chunky cracked purple crystal nugget with glowing orange light in the wide fissures. Bottom-right: Starry Ore, a polished four-pointed golden crystal star.
Style: match the chunky polished 3D game icon look and native silhouettes of the six references. Colorful, tactile, crisp facets, lighting from upper-left. No outlines except each item's soft local ambient shading, no surrounding colored glow.
Composition: every icon independently centered within its own equal 512x512 cell. Each fills about 72% of its cell, maintain at least 60px empty margin on each side of each cell. All six separate, no touching, no dividers, no frames, no text, no labels.
Background: genuine transparent alpha. No white matte or simulated transparency checkerboard. Preserve transparent space between all six icons.
```

## Icon matte correction

```text
Use case: background-extraction
Primary request: keep the six objects in this exact 3-column by 2-row layout, preserving their silhouettes, materials, colors, framing and scale. Remove ALL the blurred colored background, external colored auras and exterior drop shadows. Replace every background pixel outside the six hard object silhouettes with ONE perfectly flat solid pure chroma green #00FF00. No background gradients or mottling, no shadows or glow on the green, no green inside opaque objects. The translucent Rage Vial stays purple glass; do not fill its purple interior green. Keep all six objects separated with wide clean green gutters. Do not redraw or change the items. Output a clean production keying matte in 1536x1024.
```
