# Crafting Station

A free 3×3 defense, one per village, at Town Hall 18. The owner puts one of three Crafted Defenses on it and can switch at any time for free. Each defense keeps its own three modules (hitpoints, damage and an effect), levels 1–10, each upgraded with a builder like a building; the defense's level is the sum, 3–30. An empty station has 1,000 hitpoints, counts as a defense for defense-targeting troops and does not attack.

## Source

`node scripts/import-crafted-defenses.mjs` builds `reference/crafted-defenses/catalog.json` from the wiki snapshots in `reference/official-wiki/defenses` (crafting-station, hot-candle, hero-hunter, cake-a-pult). Those pages were checked field by field against client 18.400.21's `seasonal_defense_modules.csv` and `special_abilities.csv`. Where the live game has moved on, the pinned client wins:

- **Town Hall.** The station is at Town Hall 18 and each module's first level needs Town Hall 12. The live game opened it at Town Hall 11 in August 2026.
- **Melt timer.** The Hot Candle's timer starts with the first destroyed building (`ActiveAfterNumBuildingsDestroyed 1`); the live game later moved it to the first deployment.
- **Bomb fuse.** The Cake-A-Pult's bomb detonates after the client's 1.999 s, not the wiki's rounded 3 s.

## Defenses

| Defense | Attack | Modules |
| --- | --- | --- |
| Hot Candle | 10.5 tiles, ground and air, a volley every 0.5 s of 6 single-target flames. Once its melt timer runs, it drops to 4 flames and then 3. Flames double up on units when fewer are in range, as the Inferno Artillery's do. | Hitpoints (Elixir), Damage per flame (Gold), Seconds Active (Dark Elixir) |
| Hero Hunter | 9.5 tiles, ground and air, one card every 0.6 s. New targets are heroes when any are in range; it doesn't drop its current target for one. Heroes take 2× damage. Each hit poisons for 3 s with the slow, attack slow and damage per second of a Poison Spell of the module's level. | Hitpoints (Dark Elixir), Damage (Elixir), Poison Level (Gold) |
| Cake-A-Pult | 3–12 tiles, ground and air, one cake every 3 s. The cake splashes 2.5 tiles on its target's layer and leaves a bomb that hits both layers in 2.5 tiles after its fuse. | Hitpoints (Gold), Damage (Dark Elixir), Explosion Damage (Elixir) |

Shots borrow client projectile rows for flight and drawing: fire arrows for flames, the Headhunter's cards, and a mortar shell for the cake.

## Art

The empty platform is the client's own art. The client's art for the three defenses isn't in this repository, so `art/source/crafted-defenses-v1` holds authored SVGs, which `scripts/crafted-defense-art.mjs` rasterizes to `public/assets/crafted`. They're flatter than the client's painted buildings.

## Not implemented

- Crafting phases ending and new defenses rotating in.
- Sparky Stones.
- Upgrading modules of two different defenses at once. Here one module job runs per station, since the station is one building.
- The defense's matchmaking weight.
