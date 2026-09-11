# Troop presentation

September 11, 2026. Ground troops face their next navigation waypoint while walking around obstacles and turn toward the building's center when attacking. Static Goblin, Wall Breaker and King artwork uses its native opposite orientation. Nearly vertical headings keep the previous side to avoid flicker.

Walk frames and Balloon sway now use battle time. Pausing playback stops their motion, and playback speed advances it with the simulation. Stationary ground troops stop walking and bobbing in place. Reduced motion selects a fixed frame and removes bobbing and attack recoil. King's attack recoil uses his actual 1.2-second attack cycle rather than the Swordsman's 0.8-second cycle.

Six focused pose tests and three browser scenarios cover obstacle-facing direction, attack-facing direction, static art orientation, airborne headings, vertical stability, stationary units, pause behavior and reduced motion. The neighboring projectile timing scenarios also pass.

Defeats now retain their simulation timestamp. Ground troops collapse, airborne troops fall toward the ground, and spring-trap victims follow an upward arc. These poses freeze with battle time and reconstruct at their actual age after a seek, so old casualties do not restart their fade when their sprites are recreated. Completed battles and reduced motion hide casualties immediately. The durations and offsets are local presentation tuning; this does not change damage, targeting or replay combat versions. Six unit cases and three browser scenarios cover casualty timestamps, Wall Breaker detonation, ejection, pause, late reconstruction and cleanup. Existing replay seeking scenarios also pass.

This improves the existing mirrored sprites. Full directional art, dedicated attack/death frames, interpolated locomotion and simulation-timed transient sparks and smoke remain open.
