# Attacking Rocket Balloon source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All nine `characters.Rocket Balloon` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=3000`,
`NewTargetAttackDelay=2250`, no cooldown override, `SelfAsAoeCenter=TRUE` and
ground-only targets. Under the established
[older-engine split-clock adapter](../attacking-giant/README.md), the period
splits into 1.5 s windup and 1.5 s recovery. The new-target field supplies
0.75 s of initial timer charge, giving a **0.75 s fresh windup**. Modern
executable first-hit timing remains unverified.

Before this change, actual deployments at x=11.4 and x=6.9 both bombed at
2.3 s despite arriving at 0.45 s and 1.4 s. The source delay was being counted
from target acquisition; longer travel consumed it. Repeated 20 Hz releases
also accumulated a 0.05 s timer remainder.

The [official-wiki comparison](../official-wiki/spells-siege-super/rocket-balloon.md)
agrees with the three-second period, ground splash and death damage. Source
tiers 1–9 display Balloon levels 5–13; normal boosting begins at displayed
level 8. Client range remains zero; the wiki reports half a tile. Booster
speed units remain ambiguous, so their existing conversion is retained.

## Recording version 185

Carried Rocket Balloons begin their fresh charge after arriving. Subsequent
attacks repeat every three seconds, retaining recovery and sub-step remainder.
Replacement targets consume remaining recovery once before a fresh charge.
Freeze/stun hold both phases, attack-speed modifiers scale them, and original
poses follow the recorded phase offset.

Buildings and ground defenders use the same self-centered blast at release,
covering eligible building footprints and ground defenders within 1.2 tiles.
Air defenders, traps and friendly units remain outside its damage targets.
Defender releases no longer create a generic bomb projectile. Existing
building blast geometry and damage are unchanged by the extracted helper.

Defense preference and flying Wall crossing retain their rules. Deployment
boosters still expire four seconds after placement, including while Ice Block
holds recovery. The separate death blast retains its 0.416 s source delay,
ground-only 1.2-tile radius and per-tier damage, including defeat during Freeze.
Its deadline is resolved by the existing fixed simulation steps.

Only an initial army carrying Rocket Balloon enables this change. Versions
184 and earlier preserve their previous timing and defender bombs. Ordinary
Balloon, source stats, assets, audio, village save format and replay envelope
are unchanged.

## Validation

`tests/attacking-rocket-balloon-windup.test.ts` checks every source tier from
near and far, first/repeat timing, recovery retargets, Freeze/stun, speed
scaling, timer remainder, ground-only self-centered splash, footprint edges,
trap exclusion, defense preference and flying movement. All tiers retain
independent delayed death damage. Actual Cannon, lured Golem, Ice Block and
Monolith recordings reconstruct complete portable states in both directions
under versions 184 and 185. The real Ice Block fixture also checks held
recovery and booster expiry.

`tests/browser/attacking-rocket-balloon-windup.spec.ts` checks current and
historical recordings on phone and desktop, original body meshes, charge
offsets, exact reverse seeking, read-only drawing, reduced motion, asset
requests and WebGL health. Additional cases cross actual Ice Block freezes,
booster expiry, Monolith defeats and delayed death blasts. Screenshots go to
ignored `output/playtest/`.
