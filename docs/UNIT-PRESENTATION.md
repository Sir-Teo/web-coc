# Troop presentation

The starter melee troop now uses the [Barbarian name, portrait and four-frame atlas](BARBARIAN-ART.md), with a fixed idle frame and no procedural walk bob. Its internal save/replay key remains `swordsman`.

September 11, 2026. Ground troops face their next navigation waypoint while walking around obstacles and turn toward the building's center when attacking. Goblin and Wall Breaker walk atlases and static King artwork use their native opposite orientation. Nearly vertical headings keep the previous side to avoid flicker. The specialist atlases use a planted passing pose when idle, attacking or in reduced motion; their drawn gait replaces procedural body bobbing. See [the artwork record](SPECIALIST-WALK-ART.md).

Walk frames and Balloon sway now use battle time. Pausing playback stops their motion, and playback speed advances it with the simulation. Stationary ground troops stop walking and bobbing in place. Reduced motion selects a fixed frame and removes bobbing and attack recoil. King's attack recoil uses his actual 1.2-second attack cycle rather than the Barbarian's 1-second cycle.

Six focused pose tests and three browser scenarios cover obstacle-facing direction, attack-facing direction, static art orientation, airborne headings, vertical stability, stationary units, pause behavior and reduced motion. The neighboring projectile timing scenarios also pass.

Defeats now retain their simulation timestamp. Ground troops collapse, airborne troops fall toward the ground, and spring-trap victims follow an upward arc. These poses freeze with battle time and reconstruct at their actual age after a seek, so old casualties do not restart their fade when their sprites are recreated. Completed battles and reduced motion hide casualties immediately. The durations and offsets are local presentation tuning; this does not change damage, targeting or replay combat versions. Six unit cases and three browser scenarios cover casualty timestamps, Wall Breaker detonation, ejection, pause, late reconstruction and cleanup. Existing replay seeking scenarios also pass.

Transient sparks and smoke now share the [battle effect timeline](EFFECT-TIMING.md). Full directional art, dedicated attack/death frames, interpolated locomotion, camera shake timing and audio pause behavior remain open.
