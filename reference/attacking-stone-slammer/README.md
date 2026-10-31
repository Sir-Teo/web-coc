# Attacking Stone Slammer blasts and phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six Stone Slammer rows in [the combat tables](../full-client/combat.json)
specify a 2.5-second attack period, 0.55-second recovery override, 2.25-second
new-target charge offset and zero physical range. The established
[split-clock adapter](../attacking-giant/README.md) therefore gives a fresh
**1.7-second charge**, 1.95-second repeat windup and 0.55-second recovery.
Modern executable first-hit timing remains unverified.

The primary blast deals source DPS × 2.5 within one tile. `Damage2` adds a
simultaneous three-tile ground blast: maximum damage through two tiles, then
linear falloff to `Damage2Min` at three tiles. The pinned client declares no
secondary delay. At source tiers 1–6, primary hits rise from 1,000 to 2,050
and secondary maxima from 200 to 700, with minima of 100 to 350.
A target inside the primary blast receives both components. See the
[pinned comparison](../official-wiki/spells-siege-super/stone-slammer.md).

Before version 222, the generic controller omitted `Damage2` entirely and
counted approach time toward the new-target wait. Minimum/maximum probes
first hit at 2.3 seconds after a short approach, but immediately on arriving
at 4.05 seconds after a long approach. A Wall 2.5 tiles from the target center
received no damage. Version **222** starts a complete charge after arrival
and resolves both areas at its attack event, without adding projectile flight.
Freeze/stun hold active phases; action-rate effects, recovery, retargeting and
fractional-step remainders use the shared attacker controller.

Ground defenders use point distance and buildings use the game's existing
footprint-distance convention. Air defenders, traps, future births and friendly
units are excluded. The secondary falloff uses the same geometry. The existing
character-wide 25× Wall multiplier is retained for both components. The wiki
attributes that multiplier only to the wider blast; the pinned character row
does not identify a component-specific scope, so exact modern Wall-hitbox parity
is not claimed. This pass adds no new geometry convention or source asset.

The original `Siege_Machine_Bowler*_attack1_1` takes have ten timeline frames
at 30 FPS and action frame ten. The shared phase offset aligns physical contact
with original frame nine, including replay rewind and reduced motion. Original
body art and the existing area-blast effect are reused. The separate 500-damage,
three-tile death blast and 0.416-second delay remain unchanged. Clan Castle
payload release is outside this change.

Only initial armies carrying Stone Slammer enable `nativeStoneSlammerAttacks`.
Version 221 and earlier retain their complete state and original UI readouts.
Current Info labels source DPS and hit damage as **Primary** and separately
shows secondary damage, radius, falloff and Wall multiplier, using the effective
research or potion tier. No HP, movement, save schema or replay envelope changes.

`tests/attacking-stone-slammer.test.ts` covers every source tier from near/far,
both damage components, radius/falloff boundaries, ground/air eligibility,
future births and traps, Freeze/stun, rates, retarget recovery and irregular
steps. Real storage and Archer-lured ground/air Castle encounters reconstruct
complete portable states in both directions. Four version-221 snapshot hashes
were captured twice before implementation and remain pinned.

`tests/native-unit-presentation.test.ts` checks original first/last-tier contact
frames, historical controls, rewind, reduced motion and read-only presentation.
Browser scenarios exercise complete Node/browser states and original body meshes
on phone/desktop; the siege Info checks also cover landscape and both research
extremes. Screenshots stay in ignored `output/playtest/`.
