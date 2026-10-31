# Charged Flame Flinger projectile bursts

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All five Flame Flinger rows declare `AttackSpeed=5000`,
`CoolDownOverride=550`, `BurstCount=3` and `BurstDelay=128`, with no initial
new-target charge offset. See the [combat tables](../full-client/combat.json)
and [pinned comparison](../official-wiki/spells-siege-super/flame-flinger.md).

Version **228** uses the established attacker split clock and 64 ms burst-gap
adapter. The fresh source charge is 4.45 seconds, rounded to **4.48 seconds**.
Three projectiles release **0.128 seconds** apart. The rounded five-second gap
is 5.056 seconds; adding the two shot gaps gives a **5.312-second cycle**.
After the last projectile, 0.576 seconds of recovery precede the next charge.
Each projectile deals source DPS × 5.312 / 3, preserving the client row's
127–184 average direct DPS. Base/maximum projectile damage is approximately
224.875/325.803; Info rounds this to **224.87/325.8**.

These values closely explain the wiki's approximate per-projectile damage,
while retaining the pinned client DPS instead of substituting the wiki's
conflicting DPS. The clock and normalization are the same local conventions
used by Super Dragon. Exact modern executable timing and integer rounding
remain unverified. Version 227 and earlier keep their single large release,
its original clock, and complete prior state.

The first shot shares the attack controller's fractional charge remainder.
The remaining shots consume active attack time: Freeze/stun hold them, partial
Freeze slows them and fractional steps retain their physical release times.
A committed living ground defender can retreat without truncating the take;
a lost or hidden target cancels unreleased projectiles and enters recovery.
Released projectiles survive caster loss. Existing movement, healing immunity
and discrete 17-HP health-loss ticks are retained.

Each projectile captures its ground aim and uses the original level-specific
`FireCatapultProjectile` row. `DontTrackTarget` is honored on this new path.
Its impact resolves one ground area pass: ordinary buildings and ground
defenders take the base hit once, Walls receive their separate 8× multiplier
once, and air defenders/traps are excluded. Each impact also creates the pinned
level-specific `FireSpiritExplosion` at its physical arrival time, even after
the parent is gone. This preserves the [flat Wall pulse bonus](../flame-flinger-wall-pulse/README.md)
and [shared sustained burn cap](../flame-flinger-overlap/README.md).
The existing fixed-point aim adapter is retained; projectile scatter is outside
this change. Existing burn-spell flat-hit/layer behavior is also retained.

The original `SM_catapult1..5_attack1_*` takes have **32 timeline frames at
30 FPS**, with action frame seven. The shared phase offset aligns the first
release with source frame six, including rewind and reduced motion. No new
artwork or invented attack take is introduced. The ranged area helper gains
an optional building-damage callback; existing Wizard/Super Dragon calls keep
their prior behavior. Ground flight origins remain separate from flying troops. The burst clock stays
independent of spell resolution; projectile impact/burn handling lives in its own adapter.

Only initial armies carrying Flame Flinger enable `nativeFlameFlingerBursts`.
Current Army cards and Info show per-projectile damage and distinguish direct
DPS from burn DPS. Info also lists shot count/spacing, fresh charge, full burst
interval and the per-projectile Wall hit. Historical battle inspection retains
its former hit and interval labels. Power Potion previews use the effective
tier and return to permanent research values on expiry.

Four complete version-227 recordings, covering tiers 1/5 from two distances,
were captured twice and reconstructed through portable forward/backward seeks
before implementation. Full-state hashes remain pinned. New recordings use the
same checks. Model coverage includes every tier, first/repeat releases, holds,
slowdown, fractional steps, target loss, caster loss and pending burns, Wall
scaling, ground/air/trap eligibility and actual Castle encounters. Original
presentation tests pin source release frames and read-only/reduced sampling.
Wizard and Super Dragon regressions cover the shared area path. Browser checks
cover complete states, original body/projectile meshes, old guide controls,
source Info across three viewports and potion expiry. Screenshots remain in
ignored `output/playtest/`.
