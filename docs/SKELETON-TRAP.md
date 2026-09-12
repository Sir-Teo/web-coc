# Skeleton Traps and defending units

## Primary reference

The numerical reference is Supercell's immutable public client bundle `18.400.21`, content hash `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`:

- [traps.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/traps.csv): `Skeleton Trap`, global ID `12000008`. Download SHA-256 `757ca07de02b26b2071b52bb3cb495df2f0ae879731a859d3102ca3552dd528c`.
- [characters.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/characters.csv): `Trap Skeleton` (`4000019`) and `Trap Air Skeleton` (`4000021`). Download SHA-256 `5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89`.
- [globals.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/globals.csv): defending-unit wall jumping enabled, seven-tile alliance alert radius. Download SHA-256 `16210fc28bfb86d00ea04d581a99fe98e128172017b2d4f637b8848c0cf20087`.
- [projectiles.csv](https://game-assets.clashofclans.com/7f04bdfdc4124b1f49308423bb8f4aa8b137aae3/logic/projectiles.csv): `ps_chr_WizardAttack_Projectile`. Download SHA-256 `71cda0e457ad88a6772f6421a22419b24d6bcf78d0ed305f09184404889a72dc`.

Blank fields inherit the preceding value within a named record. Prices and durations are undiscounted. The [Skeleton Trap community reference](https://clashofclans.fandom.com/wiki/Skeleton_Trap?page=1) corroborates the TH8 count/ceiling, light wooden coffin at levels 1–2, ground skull/air wing badge, paired red balloons, and defending-unit health markers. [Clan Castle](https://clashofclans.fandom.com/wiki/Clan_Castle) explicitly includes ground Skeleton Trap units among defenders that jump their own walls. These references support the appearance and broad behavior; they do not establish pixel-exact animation or target-selection rules.

## Supported progression and timing

| Trap level | Skeletons | Skeleton level | Gold | Destination duration |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2 | 1 | 6,000 | Instant |
| 2 | 3 | 1 | 250,000 | 5 hours |

Town Hall 8 permits two traps, up to level 2. The 1×1 footprint is passable and does not exclude deployment. Both levels share artwork, as in the client exports. Placement uses no builder time; upgrading requires a builder and disables activation. Ground and air modes persist with village saves, layout slots, undo/redo and replay exports. A mode cannot change during battle or construction.

The circular trigger radius is five tiles, with one housing space minimum and the selected ground/air layer. The trap waits 600ms before the first skeleton, then 150ms between spawns. Spawning continues if the triggering attacker dies. Each skeleton waits 500ms after its own spawn before moving or attacking. Processing a wide frame retains the individual scheduled spawn times.

| Skeleton | HP | DPS | Damage per hit | Attack interval | Movement | Range | Targets |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Ground | 30 | 25 | 17.5 | 0.7s | 3 tiles/s | 0.4 tiles | Ground |
| Air | 30 | 25 | 17.5 | 0.7s | 2.2 tiles/s | 0 tiles | Air |

The air record explicitly specifies zero attack range. Community tables sometimes show 0.4; the implementation uses the primary value. These are trap defenders, distinct from Witch-summoned skeletons and later level-two trap skeletons.

## Combat and replay behavior

Defenders have their own battle collection and negative identifiers, separate from the attacking army. They pursue eligible live attackers, retain a living target, idle when their layer has no targets, and preserve attack cadence across uneven frames. Ground defenders use paths through their own walls while respecting buildings. Ground attackers still have to break obstructing walls.

An alerted defender can draw nearby eligible attackers into retaliation. Archers, Wizards and Dragons can fight air skeletons; ground-only attackers cannot. Healers and Wall Breakers retain their specialized roles. Troops with a preferred building type retain that priority while such targets exist, and finish an already selected building before accepting an alert. After a defender dies, ordinary attackers resume building targeting.

Projectile allegiance explicitly distinguishes defending units, attacking units and buildings. Wizard fireballs, Balloon bombs and Dragon breath can damage defenders; ground splash can also hit nearby building footprints. Lightning hits both defender layers and stuns surviving defenders. Healing and Rage affect the attacking army only. Balloon and Wall Breaker death damage can kill ground defenders. Defenders never consume the attacking army's housing or keep an exhausted attack alive by themselves. They do not contribute to destruction percentage.

Combat version **22** captures this change and the Wizard projectile correction. The portable replay whitelist includes trap mode. Seeking rebuilds spawn sequences, movement, targets, deaths and sprites from the recorded starting state; it clears old defender sprites and effects. A new attack starts with armed traps and no defenders. Save version remains **4**. Older combat recordings retain their result summaries but cannot play under the new rules.

## Wizard flight correction

The Wizard character references `ps_chr_WizardAttack_Projectile`, whose `Speed=500` gives **five tiles per second** and whose `DontTrackTarget=TRUE` fixes the landing point at launch. It is not ballistic. The former implementation used a locally chosen 14 tiles/s and tracked moving targets. A moving defender can now leave the 0.3-tile blast before the fireball arrives. Wizard Tower projectiles are separate and are unaffected. Close-range minimum flight time and visual muzzle placement remain local presentation choices.

## Artwork and fidelity limits

Original generated coffins and skeleton animation sources, exact prompts and provenance live under `art/source/skeleton-v1/`. `scripts/skeleton-assets.mjs` derives three transparent coffin WebPs and two six-frame 128×128 character atlases; `--check` reproduces the shipped derivatives byte for byte. The deployed files are `public/assets/buildings/skeleton-trap-v1/{ground,air,spent}.webp` and `public/assets/characters/skeleton-v1/{ground,air}.webp`. Exact prompts are in [provenance.json](../art/source/skeleton-v1/provenance.json). The built-in `image_gen.imagegen` tool produced the sources. No extracted Supercell artwork is distributed.

Ground and air defenders have walking/drifting and attack poses, a persistent red health bar with a skull marker, directional flipping, ground/air layering and defeat feedback. Presentation follows the battle clock, including pause, replay speed and reduced motion. The coffin rises over a locally chosen 0.25 seconds, changes to its open state on first spawn, and disappears by 1.6 seconds. Original PNGs remain outside the production bundle.

Native target-selection scoring, ally-alert propagation, target memory, character collision radii, wind-up/action frames and mixed ground/air splash need further validation. The seven-tile alert currently tests proximity to a defender that has attacked, then locks that target; it does not reproduce a proven native alert graph. Ground paths refresh every 0.3 seconds. Spawn offsets, wall-jump height, hit anchors, sprite scale and animation durations are local interpretations. The six-pose art is not a native directional atlas. Clan Castle troops, defending heroes, online defenses and higher trap levels remain unfinished.

Two authored traps, one in each mode, appear in campaign stages 8–12. The 288-battle audit is a local playability check, not evidence of multiplayer balance. Validation and captured views are tracked in [QA.md](QA.md).
