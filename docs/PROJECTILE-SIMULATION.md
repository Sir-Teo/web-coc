# Projectile simulation

September 11, 2026. Ranged troop and defense attacks now queue damage in battle state. The renderer positions each projectile from its launch and impact times using the same simulation clock. Pausing stops travel; replay speed changes travel and damage together; seeking reconstructs pending shots without replaying launch effects.

Arrows, cannonballs, rockets, fireballs, arcane shots, and Balloon bombs apply damage at impact. Melee attacks remain immediate. Mortar shells and trap fuses retain their existing delayed behavior. Ranged attacks against path-blocking walls use the same queue. Wizard and Wizard Tower splash resolves at impact; Wizard Tower splash affects only the targeted ground/air layer.

A launched shot survives destruction of its source. Direct shots follow their original target and cannot redirect damage to a replacement when that target dies. Splash shots retain their last target position if the target dies. Attack damage, including Rage, is captured at launch. Impacts due in one simulation step resolve in impact-time order. The last attacker dying does not end the raid while shots remain airborne. Surrender, timeout, full destruction, and a new battle discard pending shots. Long frames stop at the 180-second deadline.

Reduced motion suppresses flight graphics and muzzle flashes; stationary feedback still appears at the actual impact time. Temporary graphics are removed on impact or a scene transition. Intact building heights anchor shots even when a source or target changes to rubble.

## Local tuning

These values are local game tuning, not verified live Clash of Clans statistics:

| Weapon | Travel |
| --- | --- |
| Arrow | 18 tiles/second |
| Cannonball | 16 tiles/second |
| Rocket | 22 tiles/second |
| Fireball | 14 tiles/second |
| Arcane shot | 16 tiles/second |
| Balloon bomb | 0.33 seconds, accelerating visually downward |

Other shots have a minimum flight of 0.12 seconds. Direct homing shots use the launch distance to set their arrival time. The current simulation runs at 50 ms intervals during live play. Its renderer shares that clock; this pass does not introduce sub-step interpolation or certify exact live-game attack speed, splash radii, or targeting rules. The subsequent [Balloon bomb pass](BALLOON-BOMBS.md) adds attack splash; dedicated directional attack animation remains open.

## Verification

`tests/projectiles.test.ts` checks damage immediately before and at impact, once-only hits, posthumous final stars, moving targets, destroyed shooters, dead-target isolation, Rage expiry, surrender cleanup, and timer boundaries. Existing attack-event, defense splash, targeting, and campaign audits exercise the changed timing. `tests/browser/projectile-timing.spec.ts` checks real arrows remain stationary without simulation advances and that damage and visible impact occur together, including reduced motion.

Additional cases verify ranged attacks at blocking walls and chronological resolution when a long step contains multiple impacts. The campaign audit covers 144 army/approach scenarios and retains a three-star route through all 12 stages. Seven combat/flight scenarios passed in WebKit. The full Chromium run passed 63 scenarios and exposed a shop interaction failure investigated in [INPUT-GESTURES.md](INPUT-GESTURES.md); the projectile and replay scenarios passed in that run.

The additional replay implementation in the working tree advances its combat version to 2; version-1 result summaries remain readable but their simulations cannot be replayed under changed combat rules. Replay equality checks include pending projectiles. Portable replay file format remains version 1 because the envelope has not changed.
