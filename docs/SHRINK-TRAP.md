# Shrink Trap

Updated September 12, 2026. **Magic Practice, native stage 55, is playable with all eight original Shrink Traps.** Original layouts, levels, health, scenery, prerequisites and loot are preserved. The next stage retains its own mechanics gate. The trap is a campaign NPC identity (`12000017`), with the existing passable 2×2 trap archetype and one HP; it is never offered in the home shop or accepted in home saves.

## Source facts and local combat interpretation

The pinned client 18.400.21 provides the trap, spell and global fields in [the source reference](../reference/shrink-trap/README.md). [combat.json](../reference/shrink-trap/combat.json) is a compact, reproducible projection, so simulation code does not import the full source graphics archive.

Supercell's [2017 announcement](https://supercell.com/en/games/clashofclans/blog/news/week-3-season-of-the-witch/) describes a 50% movement and attack-speed reduction. Its [2022 correction](https://supercell.com/en/games/clashofclans/blog/release-notes/quality-of-life-bonus-update-2/) removes the health penalty. The implementation preserves **current HP, maximum HP, damage per attack and healing per pulse**, including on refresh and recovery. The source's legacy `ShrinkHitpointsRatio=50` is not used as a health or visual-scale rule.

The following schedule is an explicit local interpretation of retained fields, not verified native executable timing:

| Event | Local timing or rule |
| --- | --- |
| Activation | One live ground or air attacker within two tiles; minimum housing one, heroes count as 25 |
| Bottle handoff | Activation + `14 / 24` seconds (`ActionFrame / clip FPS`) |
| Spell deployment | Handoff + 300 ms charging time |
| First status pulse | Deployment + 1,000 ms hit time |
| Subsequent pulses | 75 total, at 250 ms intervals |
| Active area | Fixed center, four-tile spell radius, 20 seconds from deployment |
| Recovery | Seven seconds after the last pulse received |
| Overlap | Refresh the same status; no compounded slowdown or health change |

The three-tile trap `DamageRadius` remains separately represented. Because the trap has no direct damage and calls a named spell, area membership uses that spell's four-tile radius. `RandomRadiusAffectsOnlyGfx` does not randomize combat membership. Pulses affect attackers on both layers, including Healers, heroes and summoned troops; they exclude defenders, buildings, dead/ejected troops and troops whose spawn time is later than the pulse. The spell remains at its original position after the triggering troop leaves or dies. An ended battle resolves no further pulses.

As with the existing trap system, activation and area membership are sampled after attacker movement in each simulation step. A wide imported step catches up each scheduled pulse once using the then-current positions; it does not reconstruct unrecorded intermediate paths. This is not a claim of step-size-independent native movement. The pulse counter prevents duplicate refreshes. A partial status expiry slows only the overlapping portion of the next movement/attack interval.

Slowdown applies to the final movement speed after existing Rage and hero ability boosts, and to attack/healing cooldown progress. Damage and healing magnitudes retain their usual spell/equipment modifiers. Path refresh, projectile flight, Air Sweeper displacement and Spring Trap suspension retain their own clocks. The exact native ordering of all spell/hero combinations remains unverified.

## Native presentation

The ground compartment, rising bottle, reveal clip, aura, range animation, grass, confetti and Ogg sound use the retained original graph and unchanged texture pixels. The spent compartment persists after the bottle disappears, including the original empty terminal trigger frame. Registration is a local calibration: 1.2 screen pixels per native unit and ground contact `(0,50)` in the shared source bounds. The bottle and compartment use the same root transform.

The range export has a **one-frame outer clip with a 685-frame animated child**. Its effective duration is fitted to the particle lifetime; using the outer duration would leave the range marker tiny. This is an opt-in duration override in the shared particle sampler, preserving existing callers' arithmetic. Independent source witnesses now include eight range phases and an expanded additive range sample.

Source emitter scale, fade, gravity, blend variants and the shared particle projection are retained. Local deterministic visual sampling does not advance combat RNG. The original reveal sample plays once at volume 90/pitch 100 through the shared audio timeline. A pulse emits no generic damage flash, synthesized explosion or hit sound.

Troops use a local **half-size visual treatment** while affected; this is not inferred from the legacy health field. The accumulated slowed clock keeps walk phases continuous through refresh and recovery. Shadows and hero health-bar height follow the visual scale. Reduced motion keeps the spent compartment, a static range marker and the status size, with bottle flight and moving particles suppressed. Battle finish, return home, seeking and scene shutdown clean up retained effects and audio.

## Compatibility and validation

This is a compatible extension of **replay version 34**: earlier supported battles have unchanged simulation values, and new optional status state exists only after this new NPC's pulses. Builds without the NPC reject its unknown identity during validation instead of playing it as a Giant Bomb. Earlier schema versions, practice replays, wrong archetypes and unsupported levels reject Shrink Trap identity. Home save version remains 4.

Tests exercise both trigger layers, Healers, heroes, Rage, refresh/overlap, trigger death, source radii, pulse catch-up, HP preservation, partial expiry, spring suspension, native ring timing, audio, reduced motion and replay isolation. The legal 200-space TH8 fixture uses four P.E.K.K.As and five Dragons in the intact village; it naturally ends at **33% destruction, zero stars, 62.9 seconds**. This is defeat/replay evidence, not a claim that this army should clear the level.

Browser checks cover desktop, portrait phone and landscape phone at DPR 2, full-state comparison with Node at every simulation step, original GPU pixels, single-texture batching and context restoration. Production checks import/export through shipped UI, inspect pulse/status state and final results, and repeat offline in Chromium. See [QA.md](QA.md) for actual runs.

Native executable timing, exact radius handoff, visual scale, particle equations and ordering with additional future troop/spell mechanics still require independent corroboration. The implementation preserves source facts and documents these local choices without claiming complete native parity.
