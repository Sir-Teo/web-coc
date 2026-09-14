# Blacksmith and King equipment

Numeric audit: September 12, 2026 UTC; native client 18.400.21. This work implements Blacksmith level 1 and the Barbarian Puppet, Rage Vial and Earthquake Boots through equipment level 9. The local content ceiling is now Town Hall 9, which the original client would allow to build Blacksmith 2; that level is deliberately withheld because equipment level 10 needs Blacksmith 3 at Town Hall 10, so it would unlock nothing. See [TOWNHALL-TIERS.md](TOWNHALL-TIERS.md).

## Primary references

Supercell's [equipment introduction](https://supercell.com/en/games/clashofclans/blog/news/introducing-hero-equipment/) establishes two equipment slots, instant ore upgrades and using gems to cover missing ore. Its original building costs are outdated. The current [support article](https://support.supercell.com/clash-of-clans/en/articles/hero-equipment-ore-5.html) confirms the TH8 unlock and that ore obtained before building a Blacksmith is retained.

Native numeric files are from the immutable Supercell client bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`:

| File | SHA-256 of downloaded signed file | Fields used |
| --- | --- | --- |
| [buildings.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/buildings.csv) | `9aed5fed876e2914a22fa7fed688a651c691ab06170d60e2bda8dc9262fbccb1` | Blacksmith footprint, price, time, hitpoints, ore capacities |
| [character_items.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/character_items.csv) | `66e644c62331a026aec3795980d9a37af95e2120d67dfbad380c729f3645ebad` | Equipment passive stats, recovery, upgrade costs, ability levels, gates |
| [special_abilities.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/special_abilities.csv) | `c978dd90ff2335e60d988f3476d78bec72672e8c074344d149096e89951181eb` | King rage, Barbarian summons and their separate boost |
| [spells.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/spells.csv) | `385159e00327e6a1567cd91f1585b4ed0717d3f4475f0823398243482598289d` | Earthquake Boots Spell |
| [globals.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/globals.csv) | `16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087` | Common ore gem anchors 1/10/100; Glowy 5; Starry 35 gems each |
| [resources.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/resources.csv) | `15f321776bb2ae323bef624a7d7f0235d3f5f40420a6a78e1586b33e972a19d0` | Ore identity and native UI hue families |

The signed CSV decoding procedure is recorded in [KING-COMBAT.md](KING-COMBAT.md). Blank cells inherit within a named record. Equipment costs on a current row buy the **next** level; Blacksmith requirements describe the current row. Equipment levels 1–9 require Blacksmith 1; level 10 requires Blacksmith 3 (TH10), beyond the local ceiling.

Blacksmith 1 occupies 3×3 tiles, costs 600,000 Elixir, takes 12 hours, has 700 HP, and holds 10,000 Shiny / 1,000 Glowy / 200 Starry Ore. One is available at TH8.

## Data and upgrade rules

All three common items share destination prices: 120; 240 + 20 Glowy; 400; 600; 840 + 100 Glowy; 1,120; 1,440; 1,800 + 200 Glowy, for levels 2–9. The unnamed component is Shiny Ore. Starry Ore is retained for future Epic equipment and is never charged for these items.

Puppet passive HP is 309 / 385 / 467 / 564 / 649 / 734 / 836 / 940 / 1,045; recovery is 110 / 165 / 220 / 275 / 330 / 385 / 440 / 495 / 572. Vial passive DPS is 17 / 22 / 27 / 32 / 37 / 42 / 48 / 54 / 60; recovery is 150 / 225 / 300 / 375 / 450 / 525 / 600 / 675 / 780. Boots HP is 209 / 244 / 278 / 313 / 348 / 383 / 418 / 452 / 522, DPS 13 / 15 / 17 / 19 / 21 / 23 / 26 / 28 / 32, and adds no recovery.

Ability tiers change at levels 1, 3, 6 and 9. Puppet summons 8 / 16 / 20 / 30 Barbarians in batches of at most five, 0.5 seconds apart. Their independent 20-second boost gives +100/120/140/160% damage and +1.2/1.6/2/2.4 tiles/s. Vial gives +120/130/135/140% damage and +2.25/2.8/3.2/3.6 tiles/s for 10 seconds. No attack-speed boost applies.

Boots has an eight-tile radius, five pulses 400ms apart, each dealing 2/4/6/6.8% of maximum building HP and 1/1.2/1.4/1.4% of maximum ground-defender HP. `DestroyWalls=TRUE`; no storage immunity is set. The initial delay uses charging 300ms + hit 400ms = 700ms. That addition is an implementation interpretation of the published fields, not a frame measurement from the native engine. Air defenders and traps are excluded. Broader spell-engine sequencing and the one-millisecond ability's wall-damage modifier remain native verification gaps.

The initial ore acquisition path is the native missing-ore gem purchase within an upgrade, using existing earned local gems. There are no invented campaign ore rewards. Star Bonuses, Clan Wars, Trader offers, Hero Journey and special events still need their own systems before normal ore rewards can be earned here.

## Save, combat and UI integration

Optional `equipment` and `ores` fields extend save version 4 without moving village footprints or changing legacy progress. Missing equipment means the original level-one Puppet/Vial pair. Save imports validate all three integer levels, exactly two distinct known item keys, integer ore balances within the supported caps, and a completed Blacksmith for non-default loadouts/upgrades. Ore may be stored before the building exists. A building under construction does not unlock the forge.

Equipment upgrades are instant and can run while all builders are busy. They charge stored ore first. Only a confirmed gem shortfall can be purchased; each transaction checks the expected item level, confirmed gem ceiling, current balance and current building. A repeated or stale confirmation cannot pay for an unintended second level. Swapping an item already in the other slot exchanges the two positions; duplicates are impossible. Neither upgrade nor equip actions mutate an active battle.

Combat version 24 snapshots all three item levels and both equipped keys. Replay imports require that snapshot, and portable exports copy only known combat fields. Old result records remain readable, but previous-version playback expires. Home upgrades, reload, replay seeking and practice do not alter the snapshot or spend more ore. Puppet waves and their boosts use its own level, and removing the Vial removes its passive DPS/recovery and King rage while preserving Puppet boosts. Earthquake pulses originate at the activation position and continue there if the King moves or dies while the attack remains active. Hidden Teslas are immune until revealed; traps and air defenders are excluded. Ground defenders born after a scheduled pulse do not take damage from that past pulse.

The Blacksmith is available through its building action and through either equipped item in the Hero Hall. The UI has the three ore balances/caps, two equipped slots, all three available items, current/next attribute values, instant upgrade costs and the exact gem shortfall. Locked and unaffordable states explain their requirement. Starry Ore is stored but not spent on Common gear. Narrow screens stack the wallet content, slot row and upgrade action; short landscape screens retain a scrolling modal.

## Artwork and remaining fidelity

The building is based on Supercell's [official promotional reference](https://clashofclans.inbox.supercell.com/lqe2co20rkhw/4XIRh0hx2cnsBG7u45mfbL/949f41ea5973332577ad698079d8a9f4/Blacksmith_square_feature.jpg). Equipment silhouettes were inspected using the native-icon references hosted by Goblins Farm; ore shapes were checked against the official equipment announcement's images. The shipped building and six icons are generated recreations, not native pixel copies. Exact prompts, original output names, reference URLs and source hashes are retained in `art/source/blacksmith-v1/provenance.json` and the three adjacent prompt files. Built-in image_gen was used. The initial icon sheet had an opaque colored glow; a second generated green-matte version supplies the final icons. `scripts/blacksmith-assets.mjs` preserves building alpha, keys/despills the icons, removes filtering spill and registers each sprite. `--check` verifies the output bytes and runs in CI.

Earthquake graphics are local battle-clock fractures and a fading ring, with reduced-motion support and cleanup on exit. They are not native particle/ground-deformation assets. Exact first-pulse native sequencing, percentage rounding, one-millisecond wall-damage modifiers, native targeting and overkill ordering remain open. Blacksmith levels 2+, later Common/Epic gear, actual ore reward systems, multiplayer, Clan Wars, Hero Journey and physical-device performance still need implementation/verification. The production-clone goal is incomplete.
