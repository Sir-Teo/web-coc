# Troop presentation

Troops with native packs draw their sampled client scenes through
`src/game/troop-native-scene.ts`. Walk and idle state follow simulation movement; attack
poses follow cooldowns. Pausing battle time holds the native pose, and reduced motion
samples frame zero. Once a native view takes over, its hidden fallback sprite no longer
updates its walk frame or facing.

The specialist and late-troop browser checks inspect native pose samples and visible
objects for movement, direction changes, pause, reduced motion and cleanup. Their paused
fixtures explicitly render after native pages load and wait for a complete game render
before capturing the phone view, whose battlefield must contain visible pixels. The four-frame fallback atlas asset
checks remain separate, including transparency, dimensions and foot anchors.

The [King Puppet browser fixture](../tests/browser/king-combat.spec.ts) waits for the native
King and summoned Barbarian bodies before checking the wave boundary: five summoned bodies
before 0.5 seconds, then eight. Repeated seeks between 0.45 and 0.55 seconds check native body
counts alongside simulation counts, and returning home checks that both troop meshes and
hero sprites are removed without WebGL errors.

Living defending Heroes, Guardians, garrison troops and Skeleton Trap defenders now share the attacker’s green Poison cue while their native poison status is active. Native mesh colors compose with that tint, and expiry or defeat restores the original artwork or death styling. The cue reconstructs through replay seeks. `tests/browser/defender-poison-tint.spec.ts` checks each renderer on desktop and phone, including stable repeated renders, expiry, death and cleanup.

Headhunter hits also give attacking troops and heroes the green Poison cue for their timed
on-hit status. Freeze keeps its higher visual priority, and either active cloud or on-hit
Poison takes priority over Rage. The shared tint follows fallback sprites into native bodies
and restores their original colors on expiry or defeat. `tests/browser/attacker-poison-tint.spec.ts`
checks real recorded Headhunter hits, art handoff and repeated replay seeks on desktop and phone.

Royal Ghost on-hit frost and the Town Hall 13 frost field share the blue cold-status cue
while their partial slow is active. Poison takes visual priority over partial frost, and
neither can be hidden by Rage. A zero-strength slow leaves the original colors intact.
This cue does not stop animation or alter the effect's action-speed scale.
`tests/attacker-frost-tint.test.ts` covers a real Royal Ghost hit, the native Town Hall spell,
overlap and exact deadlines. `tests/browser/attacker-frost-tint.spec.ts` checks fallback and
native troop/hero bodies, reduced motion, expiry, reapplication and defeat on desktop and phone.

## Earlier sprite artwork and feedback

The starter melee troop now uses the [Barbarian name, portrait and four-frame atlas](BARBARIAN-ART.md), with a fixed idle frame and no procedural walk bob. Its internal save/replay key remains `swordsman`.

September 11, 2026. Ground troops face their next navigation waypoint while walking around obstacles and turn toward the building's center when attacking. Goblin and Wall Breaker walk atlases and static King artwork use their native opposite orientation. Nearly vertical headings keep the previous side to avoid flicker. The specialist atlases use a planted passing pose when idle, attacking or in reduced motion; their drawn gait replaces procedural body bobbing. See [the artwork record](SPECIALIST-WALK-ART.md).

Walk frames and Balloon sway now use battle time. Pausing playback stops their motion, and playback speed advances it with the simulation. Stationary ground troops stop walking and bobbing in place. Reduced motion selects a fixed frame and removes bobbing and attack recoil. King's attack recoil uses his actual 1.2-second attack cycle rather than the Barbarian's 1-second cycle.

Six focused pose tests and three browser scenarios cover obstacle-facing direction, attack-facing direction, static art orientation, airborne headings, vertical stability, stationary units, pause behavior and reduced motion. The neighboring projectile timing scenarios also pass.

Defeats now retain their simulation timestamp. Ground troops collapse, airborne troops fall toward the ground, and spring-trap victims follow an upward arc. These poses freeze with battle time and reconstruct at their actual age after a seek, so old casualties do not restart their fade when their sprites are recreated. Completed battles and reduced motion hide casualties immediately. The durations and offsets are local presentation tuning; this does not change damage, targeting or replay combat versions. Six unit cases and three browser scenarios cover casualty timestamps, Wall Breaker detonation, ejection, pause, late reconstruction and cleanup. Existing replay seeking scenarios also pass.

Transient sparks and smoke now share the [battle effect timeline](EFFECT-TIMING.md). Locomotion is now drawn interpolated between 50 ms simulation steps (teleports over 1.5 tiles, spawns and replay seeks snap), and feedback shakes apply in world units so they no longer scale with display density. Full directional art, dedicated attack/death frames and audio pause behavior remain open.

All seven troops now use audited attack intervals and movement speeds in combat; recoil follows those intervals. Info exposes researched hit/DPS values, movement speed, blast radii and death damage (see [TROOP-PROGRESSION.md](TROOP-PROGRESSION.md)). Walk frame rates, directional coverage, attack windups and per-level sprites still need their own artwork/timing passes.

On short landscape screens (height up to 600px and aspect ratio at least 4:3), troop Info uses a compact portrait column beside the two-column stat grid. The fixed dialog header supplies the troop name and a 44px Close button; redundant branding, subtitles and the duplicate portrait heading are hidden. Stats, tactics and the 44px Train action share the right column and scroll inside the panel. Portrait and desktop layouts retain their vertical arrangement. Regression checks require the first six stats to be fully visible at 844×390 and 568×320 and check all five specialist panels for readable values, no horizontal overflow and a reachable Train button. Each viewport also exercises closing the panel.
