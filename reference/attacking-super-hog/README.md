# Super Hog Rider defeat split

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve Super Hog Rider tiers declare two `ActiveOnDeath` abilities in
[the combat tables](../full-client/combat.json):

| Ability                    | Source action                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `SuperHogRiderSummonHog`   | A self spell immediately summons one matching-tier `SuperHog`.                                                |
| `SuperHogRiderSummonRider` | `JumpingRiderProjectile1`–`12` travels for 1,300 ms and its hit spell summons one matching-tier `SuperRider`. |

The Rider ability declares `AttackRange=350` (3.5 tiles) and
`ProjectileOnActivationDirection=180`. Its projectile has `FixedTravelTime=1300`,
`StartHeight=45`, rotation, a shadow and the original airborne Rider export.
The twelve projectile names share the already-shipped
`public/assets/projectiles-native/jumpingriderprojectile1/graph.json`
(SHA-256 `ca68844b0a44ab0678d2db39196ae53036718bd418816666fb26887b2dd5093b`).
The matching child health, damage, range, movement and targeting remain source-driven.

## Recording version 176

Previously the generic death handler inspected only the first ability and did
not handle its activation projectile, so neither half appeared. A defeated
Super Hog Rider now releases the Hog at its death point and queues the Rider
behind a zero-damage native flight packet. Landing consumes that linked queue
once; the generic hit-spell path cannot create a duplicate. Pending flight
keeps an attack open when the Hog dies and no reserve army remains.

The local geometry adapter projects the Rider 3.5 tiles opposite the current
combat target, falling back to the remaining route or northeast if targetless.
It clamps the endpoint to the map and uses the existing open-ground placement
rule at arrival. This heading and placement convention is deterministic; the
modern executable's precise release geometry is unverified. Original flight and
child body packs warm with the carried army. Recorded flight history supports
cold seeks after landing without mutating combat state.

Spring-ejected parents release neither half. Both children inherit a cloned
parent's expiry; an already-expired parent or a Rider whose deadline passes
before arrival cannot create a lasting body. Recall of these explicitly leveled
spawned halves remains outside the existing Recall deployment adapter.
The original landing particles flow through the projectile renderer. Both halves
reuse their existing deployment voices, with no extra voice layered over the
Rider's arrival. The carried army warms their sound files and the landing effect
pack before defeat; Puppet-only armies likewise warm their summoned Hog voices.
This loading change needs no combat-version or save-format update.

Only carried Super Hog Rider armies enable this split. Versions 175 and earlier
retain their previous defeat behavior and request no optional split flight art.
No source stats, assets, save fields or attack clocks change.

## Validation

`tests/super-hog-split.test.ts` covers all twelve source tiers, immediate Hog and
delayed Rider health/ownership/timing, backward release direction, map bounds,
flight-only combat continuation, clone expiry, ejection and midflight JSON
restoration. Actual Monolith defeats at the first and last source tiers retain
complete current/historical states through portable forward and backward seeks.
The existing Meteor throw suites verify the shared linked-arrival helper.

`tests/browser/super-hog-split.spec.ts` compares Node and Chromium battle states
and checks original parent, Hog, Rider and flight meshes on phone and desktop,
prefetch before defeat, historical controls, repeated seeks, reduced-motion
read-only rendering and WebGL health. Screenshots go to ignored `output/playtest/`.
