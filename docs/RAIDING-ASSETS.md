# Specialist troop artwork

Generated with the built-in image generation tool on September 10, 2026. These are original generated sprites, not extracted game assets. The generated alpha is preserved. The shipped Goblin and Wall Breaker use single full-body poses with procedural movement and attack feedback; they do not have directional walk atlases yet.

| Troop | Generated source | Production sprite |
| --- | --- | --- |
| Goblin | `art/source/goblin.png` | `public/assets/characters/goblin.webp` |
| Wall Breaker | `art/source/wallbreaker.png` | `public/assets/characters/wallbreaker.webp` |

`node scripts/raiding-assets.mjs` trims transparent padding and resizes the sprites to at most 360 × 420 pixels. `npm run assets` includes this step. No image service is called during builds.

## Goblin prompt

Use case: stylized-concept. Asset type: transparent sprite for an isometric village raiding strategy game. Create one full-body Goblin troop, a small muscular bright green goblin with enormous pointed ears, mischievous toothy grin, red-brown leather vest, brown belt and short trousers, barefoot, carrying a bulging sack of gold over his shoulder. Polished Clash of Clans-like toy-like painted 3D mobile game art, chunky readable silhouette, warm sunlight from upper left, soft shaded forms and crisp edges, overhead isometric three-quarter camera, facing lower right. Single character centered, entire body and sack visible, no ground plane or cast shadow, no text, no borders, no additional objects. Genuine transparent alpha background, not a checkerboard. Large sprite filling 80 percent of square image.

## Wall Breaker prompt

Use case: stylized-concept. Asset type: transparent sprite for an isometric village raiding strategy game. Create one full-body Wall Breaker troop, a small comical ivory skeleton with an oversized skull, deep dark eye sockets and broad toothy grin, tiny brown aviator cap, skinny bony arms and legs, simple brown waist belt. Both hands carry an enormous black spherical cartoon bomb in front of the chest with a short glowing orange lit fuse. Polished Clash of Clans-like toy-like painted 3D mobile game art, chunky readable silhouette, warm sunlight from upper left, soft shaded forms and crisp edges, overhead isometric three-quarter camera, facing lower right. Single character centered, entire skeleton and bomb visible, no ground plane or cast shadow, no text, no borders, no additional objects. Genuine transparent alpha background, not a checkerboard. Large sprite filling 80 percent of square image.

## Gameplay reference and tuning

Supercell's [Town Hall 16 release notes](https://supercell.com/en/games/clashofclans/blog/game-updates/december-2023-town-hall-16/) distinguish Wall Breaker attack and death damage. This implementation also separates the two. The local game's health, damage, training times, research prices, and loot shares are tuned to its existing campaign rather than claiming current live-game balance parity.
