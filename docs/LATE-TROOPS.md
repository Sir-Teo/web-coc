# Healer, Dragon and P.E.K.K.A

September 11, 2026. The Barracks roster now includes the ten elixir troops available through Town Hall 8. The seven earlier troops retain levels 1–5. Healer, Dragon and P.E.K.K.A support levels 1–3, the levels available with the local maximum Laboratory 6. Higher troop levels and Town Halls remain future work.

## Primary data and conversions

The reference is the public Supercell client asset bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`, indexed as client 18.400.21 on August 26, 2026. The immutable inputs are [characters.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/characters.csv), [globals.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/globals.csv), and [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv). The projectiles file's `HealerEnergy` record provides the fixed target location behavior and speed; globals provides `HEAL_STACK_PERCENT`.

The files have a 68-byte signature prefix, followed by an LZMA stream with a four-byte uncompressed length. To decode with standard LZMA-Alone, remove the signature and insert four zero bytes after stream byte 9. CSV row two contains field types. A non-empty Name starts a record; following rows inherit empty fields within that name. Count those rows to obtain the troop level. `UpgradeCost` and `UpgradeTimeH` describe the **next** level, whereas `LaboratoryLevel` belongs to the current row. The table below converts them into destination-level requirements.

Internal movement and distance values are divided by 100; attack milliseconds by 1,000. Damage per hit is DPS × attack interval. Negative Healer DPS becomes positive healing per second. No gold-pass, event or helper discounts apply.

| Troop | Level | HP | DPS / HPS | Damage / healing per pulse | Elixir to reach level | Research time | Lab |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Healer | 1 | 500 | 36 HPS | 25.2 healing | — | — | — |
| Healer | 2 | 700 | 48 HPS | 33.6 healing | 450,000 | 12h | 5 |
| Healer | 3 | 900 | 60 HPS | 42 healing | 900,000 | 24h | 6 |
| Dragon | 1 | 1,900 | 140 DPS | 175 damage | — | — | — |
| Dragon | 2 | 2,100 | 160 DPS | 200 damage | 1,000,000 | 18h | 5 |
| Dragon | 3 | 2,300 | 180 DPS | 225 damage | 2,000,000 | 36h | 6 |
| P.E.K.K.A | 1 | 3,000 | 260 DPS | 468 damage | — | — | — |
| P.E.K.K.A | 2 | 3,500 | 290 DPS | 522 damage | 600,000 | 12h | 6 |
| P.E.K.K.A | 3 | 4,000 | 320 DPS | 576 damage | 1,300,000 | 18h | 6 |

| Troop | Barracks | First TH | Housing | Speed | Range | Interval | Splash radius |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Healer | 8 | 6 | 14 | 2 tiles/s | 4.5 tiles | 0.7s | 1.5 tiles |
| Dragon | 9 | 7 | 20 | 2 tiles/s | 2.5 tiles | 1.25s | 0.3 tiles |
| P.E.K.K.A | 10 | 8 | 25 | 2 tiles/s | 0.8 tiles | 1.8s | — |

Secondary cross-checks: [Healer](https://goblinsfarm.com/wiki/troops/healer.html), [Dragon](https://goblinsfarm.com/wiki/troops/dragon.html), [P.E.K.K.A](https://goblinsfarm.com/wiki/troops/pekka.html), and the [Healer behavior reference](https://clashofclans.fandom.com/wiki/Healer). The downloaded primary data takes precedence where these disagree: Healer interval 700ms rather than the older 800ms, range 450 rather than a rounded five tiles, and hero healing calculated at exactly 55% rather than truncating the displayed HPS. Primary `TriggersTraps=TRUE` confirms that Healers can trigger air traps.

Raw input SHA-256:

```text
characters  5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89
globals     16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087
projectiles 71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc
```

## Combat behavior and remaining approximations

Healers choose a living ground ally in a group with more than two housing spaces, or a hero. They follow directly through the air, stop at healing range, and retain a living patient. Each pulse flies at 12 tiles/s to the patient's launch location and restores living ground allies within 1.5 tiles when it arrives. A pulse survives the Healer's death. Air units, buildings and defeated units are excluded; health cannot exceed maximum HP. Heroes receive 55%. Rage on the Healer increases outgoing healing; Rage on the recipient does not multiply incoming healing.

The marginal contribution of successive Healers is 100%, 100%, 90%, 90%, 70%, 40%, 10%, then 0%. This implementation orders contributing source IDs deterministically for each recipient. Nearby in-range Healers and pulses in flight contribute to the group count. The acquisition score uses distance plus a local 0.75-tile penalty for a full-health candidate. These targeting and allocation details are deterministic approximations, not a reconstruction of the closed-source native AI. The data's `USE_SMARTER_HEALER=TRUE` does not disclose that algorithm. Spell healing remains independent of Healer stacking.

Dragon breath applies direct damage, with full collateral damage to other building footprints within 0.3 tiles of the approached impact point. It has no moving damage projectile. Its tapered flame is short-lived visual feedback tied to battle time. P.E.K.K.A uses ground navigation and heavy melee, without a favored building or wall multiplier. Air/ground defensive targeting and trap eligibility use the existing shared predicates. Battle completion ignores remaining Healers, Healing and Rage when no offensive troop, hero or Lightning remains.

Attack windups, native internal hitboxes, exact target selection, defending Clan Castle troops, directional attack/death animations and per-level artwork remain incomplete. This pass does not claim full native combat or pixel parity.

## Art provenance and build

Three new 2×2 character sheets were generated with the built-in ImageGen tool. They are new-image generation, not edits or copied game textures. Sources are `art/source/late-troops-v1/{healer,dragon,pekka}.png`; the complete prompts are in [prompts.json](../art/source/late-troops-v1/prompts.json). The reviewed designs use white-haired, gold-dressed Healer; green, ivory-horned Dragon; and steel armor, purple horns and magenta eyes for P.E.K.K.A.

`node scripts/late-troop-assets.mjs` crops the four transparent cells, uses one scale per character, registers the body against measured centers, and places each baseline at 122px. It produces four-frame 512×128 lossless WebP atlases in `public/assets/characters/walk/` and 360×440 portraits in `public/assets/characters/`, each suffixed `-v1`. `--check` verifies byte-identical rebuilds. CI checks transparency, margins, distinct poses and rebuild consistency. AIR badges sit below army counts at all viewports. Wing and walk poses advance on battle time; pause holds them, reduced motion selects a stable pose, and the Healer faces its friendly target.

The art currently represents one appearance per troop. Native level-specific changes, including the Healer's later magenta dress and Dragon color changes, are not yet represented.

## Persistence and validation

Save version stays 4. Migration adds absent troop counts to armies, Last Army, presets and deployed raid summaries, and level-one entries to existing troop-level maps. Existing counts, malformed present values, spent resources and paid research deadlines are retained. Legacy replay setup objects are not rewritten. Replay engine version 18 records the ten-troop roster; older recordings remain valid summaries but cannot be played by the changed combat engine.

Model tests cover all nine level records, Barracks and Laboratory gates, payment and reload, pulse flight and ground-only healing, stacking, hero/Rage factors, targeting, battle completion, direct breath splash, wall strikes, malformed imports and deterministic replay. Asset tests verify all twelve frames. Browser cases exercise the real training, research, info and keyboard controls at desktop, portrait phone and two landscape sizes, alongside effects, animation, pause, reduced motion and cleanup. The campaign matrix includes the original four armies plus a 200-space Healer/P.E.K.K.A army and ten Dragons: 288 battles over twelve stages and four deployment approaches. See the latest execution evidence in [QA.md](QA.md).

The two newly tested TH8 compositions each clear all 48 stage/approach combinations with three stars. They are substantially stronger against these early authored maps than the earlier mixed army. This is reachability evidence, not proof of native campaign parity or balanced multiplayer matchups. Later campaign content and stronger defensive layouts remain needed.
