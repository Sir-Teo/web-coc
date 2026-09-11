# Hidden Tesla audit

Implemented for the local Town Hall 1–8 catalog, reviewed 2026-09-11. This completes a concealed attacking defense with six original level sprites. The local visuals and simulation are not certified pixel/frame equivalents of the native client.

## Reference data

The immutable Supercell public client bundle `18.400.21`, asset hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, supplies the numerical configuration:

- [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv): SHA-256 `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1`. `Hidden Tesla` has a 2×2 footprint, `Hidden=TRUE`, trigger radius 600, attack range 700, attack speed 600 ms, and ground/air targeting. Distances divide by 100. No projectile is configured; instant damage is the local interpretation of its attack/hit effects.
- [globals.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/globals.csv): `HIDDEN_BUILDING_APPEAR_DESTRUCTION_PERCENTAGE=50`, `REMOVE_UNTRIGGERED_TESLA=FALSE`. Raw file SHA-256 `16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087`.

| Level | HP | DPS | Damage per hit | Gold | Build time | TH |
| --- | ---: | ---: | ---: | ---: | --- | ---: |
| 1 | 600 | 34 | 20.4 | 250,000 | 2h | 7 |
| 2 | 630 | 40 | 24 | 350,000 | 3h | 7 |
| 3 | 660 | 48 | 28.8 | 500,000 | 4h | 7 |
| 4 | 690 | 55 | 33 | 600,000 | 6h | 8 |
| 5 | 730 | 64 | 38.4 | 800,000 | 12h | 8 |
| 6 | 770 | 75 | 45 | 1,200,000 | 1d | 8 |

Destination-level prices and timers are undiscounted. Two Teslas are available at TH7, three at TH8; ceilings are level 3 and level 6. Counts, visual evolution, upgrading visibility and modern removal of P.E.K.K.A priority/double damage were cross-checked against the [community Hidden Tesla reference](https://clashofclans.fandom.com/wiki/Hidden_Tesla/Home_Village). The relevant public CSV fields are retained in `art/source/tesla-v1/native-reference.json`; complete downloaded files remain in ignored `output/playtest/` evidence.

## Battle behavior

- Home Teslas are visible and occupy buildable tiles. Completed Teslas start concealed in each practice/campaign attack. Constructing/upgrading Teslas are visible to attackers and cannot fire.
- A living ground or air troop within six tiles of the tower center reveals it permanently. Healers and the King can trigger it. All offensive units discard their current target and route; healers retain their friendly assignment.
- Concealed Teslas are excluded from deployment boundaries, pointer picking, scouting text, campaign miniatures, navigation occupancy, crowd separation and offensive target selection. Central damage handling rejects direct, projectile splash, Dragon breath, death blasts and Lightning damage; hidden Teslas also ignore Lightning stun.
- Teslas count as structures throughout the attack. All surviving concealed Teslas emerge when displayed destruction exceeds 50%, meaning 51% with the local floor-based percentage. If all visible structures fall below that threshold, remaining hidden Teslas stay concealed.
- An emerged tower hits one eligible ground or air target immediately, with a seven-tile range and 0.6-second cadence. It retains a target until it dies or leaves range. P.E.K.K.A receives ordinary damage and has no priority. Lightning interrupts the attack interval like other defenses.
- Reveal timestamps exist only in the battle. Replay version 20 reconstructs them from the original snapshot and actions; returning home, repeating practice and seeking to scouting restore concealment. Earlier replay summaries remain readable, but their combat engine is not retained.
- Authored campaign stages 7–12 add one or two Teslas in previously empty cells; native single-player maps are not reproduced.

## Presentation and remaining fidelity limits

Six original, transparent sprites ship under `public/assets/buildings/tesla-v1/`. Early levels use silver components on wooden lattice towers; level 4 adds a toroidal coil, level 5 adds gold cone/supports, and level 6 adds a gold torus and conductors. Original PNGs, generation prompts and accepted iterations live under `art/source/tesla-v1/`. The built-in image generator was used; no native artwork was extracted. `scripts/tesla-assets.mjs` crops/resizes the alpha cutouts onto 384×512 canvases; `--check` verifies byte-identical rebuilds.

The tower emerges through a vertical crop over 0.28 seconds, with ground particles, a faint idle spark and blue/white electrical bolts. Effects use battle time, stop when paused and clear on replay seeks. Reduced motion removes emergence movement and particles. Electrical audio is locally synthesized filtered crackle. Art composition, the emergence duration/easing, sound, projectile-less hit timing and forced-retarget details remain approximations. The public global does not establish how the native client handles fractional destruction just above 50%; this implementation follows the documented 51% display rule. Native frame comparisons are still needed.

Tests cover native numerical tables, all ten troop triggers, circular range/dead-unit exclusions, concealed navigation/damage, upgrading state, exact 50/51 boundaries, target preference, cadence, Lightning, save validation and JSON replay equality/seeking. Browser coverage additionally checks actual textures, picking/text/boundary concealment, emergence, ground/air beam rendering, mobile construction, reduced motion and phone Info/reload. See [QA.md](QA.md) for final run results.
