# Attacking Minion source phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All fourteen `characters.Minion` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1000`,
no cooldown override or new-target delay, flying movement, ground/air targets
and single-target damage. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives
**one-second fresh and repeat charges with zero recovery**. Modern executable
first-hit timing remains unverified.

The [official-wiki comparison](../official-wiki/troops/minion.md) agrees with
the period, four-tile/s movement and damage values. Client range remains 2.25
tiles; the wiki reports 2.75. The source `gargoyle_projectile` travels at
3.8 tiles per second and retains its existing ballistic presentation.

## Recording version 188

Carried ordinary Minions begin a full charge after reaching a building or
eligible defender. Ground and air defender shots now use the original native
projectile with a flying origin instead of the generic bomb. Damage lands
once at impact, without splash. Building shots keep their native flight.
A released shot survives removal of its shooter.

Freeze/stun hold the clock and pose; attack-speed modifiers scale it. Repeat
releases retain sub-step remainder. Replacement targets begin a fresh charge.
Flying movement still crosses Walls. Trap eligibility is unchanged: a
charging Minion triggers Air Bombs while remaining outside Seeking Air Mine
housing eligibility and ground-bomb targets.

Only an initial army carrying ordinary Minion enables this change. Versions
187 and earlier preserve their previous first release and defender bombs.
Super Minion's separate Long Shot behavior, source stats, assets, audio data,
village save format and replay envelope are unchanged.

## Validation

`tests/attacking-minion-windup.test.ts` checks every source tier from near and
far, fresh/repeat timing, native flight speed and flying origin, damage at
impact, both defender layers, no neighboring splash, Freeze/stun, external
speed modifiers, sub-step remainder, replacement targets, Wall crossing,
released shots and trap eligibility.

Actual Cannon and lured Golem fights reconstruct complete portable states
under versions 187 and 188. The air-defender fixture lures a real Dragon with
an Archer, casts level-seven Freeze and waits for its hit before deploying
the fragile Minion. Its spell research is part of the initial setup, and no
health or status state is injected into that recording. Forward and reverse
seeks cross charge, release and impact with the Dragon still frozen.

The shared direct-attack fixture now accepts explicit extra buildings, spell
research and a before-deployment action hook. Existing Dragon Rider and
Rocket Balloon death fixtures retain the same layouts and recordings.

`tests/browser/attacking-minion-windup.spec.ts` checks current and historical
recordings on phone and desktop, original first/last-tier body and projectile
meshes, charge offsets, exact seeking, read-only drawing, reduced motion,
asset requests and WebGL health. Screenshots go to ignored `output/playtest/`.
