# Attacking Baby Dragon phases and Tantrum

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All twelve `characters.Baby Dragon` rows in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1000`,
no cooldown override or new-target delay, flying movement, ground/air targets
and 0.3-tile splash. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives a
**one-second fresh and repeat windup, with zero recovery**. Modern executable
first-hit timing remains unverified.

`BabyDragonRageWhenAlone` specifies 100% extra damage per hit, a 50% attack-rate
increase and a 4.5-tile ally radius. The
[official-wiki comparison](../official-wiki/troops/baby-dragon.md) corroborates
threefold enraged DPS: twice the hit damage at 1.5 times the attack rate. The
existing cooldown cap produced 0.75-second repeats at 20 Hz; the intended
source-derived period is two-thirds of a second. Client range remains 2.25
tiles; the wiki reports 2.75.

## Recording version 186

Carried Baby Dragons begin their charge after reaching a building or eligible
ground/air defender. Tantrum scales the active attack clock, including its
fresh charge and sub-step remainder. An allied flyer arriving within 4.5 tiles
slows the remaining charge to normal rate; leaving accelerates it without
restarting it. Existing friendly eligibility, including waiting Phoenix
exclusion, still determines whether the Baby Dragon is alone. Ground allies
do not suppress Tantrum.

Damage is captured at release. An ally arriving while a shot is in flight
changes subsequent attacks, while the released shot retains its doubled
damage. Freeze/stun hold the clock and pose; external action-speed modifiers
compose with Tantrum.

Source projectile variants are `babydragon_projectile` at tiers 1–2, `_lvl2`
at 3–4, `_lvl3` at 5–9 and `_lvl10` at 10–12. All travel at 4.75 tiles per
second and retain the existing ballistic presentation. Defender shots now
retain those native projectiles and their flying origin. Their splash hits
each defender once on the struck layer, and air-targeted shots leave buildings
outside their damage targets. Building shots keep their native flight and
ground splash. Released splash survives defeat of the shooter or primary
defender.

The older pinned
[LogicProjectile](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/LogicProjectile.cs)
captures `m_flyingTarget` in `SetTarget` and selects that layer in both its
targeted and untargeted `AreaDamage` calls. This corroborates the layer adapter;
modern executable splash parity is unverified.

Only an initial army carrying Baby Dragon enables this change. Versions 185
and earlier preserve their previous timing and defender shots. Other dragon
families, numerical source stats, movement, assets, audio, village save format
and replay envelope are unchanged.

## Validation

`tests/attacking-baby-dragon-windup.test.ts` covers every source tier from near
and far, calm and enraged charges, repeat timing without drift, damage, native
flight, Tantrum boundary and ally-layer rules, mid-charge arrivals/departures,
Freeze and external speed modifiers. Ground and air splash cases check one
primary hit, nearby same-layer targets, opposite-layer exclusion and building
exclusion for air shots. Released-shot cases retain captured power and splash
after actor removal.

Actual Cannon, lured Golem, Dragon and Minion-arrival fights reconstruct
complete portable states in both directions under versions 185 and 186.
`tests/browser/attacking-baby-dragon-windup.spec.ts` checks phone and desktop,
original body/projectile meshes, charge offsets, exact forward/backward
seeking, read-only drawing, reduced motion, asset requests and WebGL health.
Additional cases cross actual ally arrival during flight. Screenshots go to
ignored `output/playtest/`.
