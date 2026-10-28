# Attacking Sneaky Goblin charges and independent invisibility

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All six `characters.Sneaky Goblin` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1000`, no
cooldown override or new-target delay, 0.4-tile range, four-tile/s movement,
ground-only melee and a resource preference with damage multiplier two.
The [older split-clock adapter](../attacking-giant/README.md) gives a
**one-second fresh and repeat charge with zero recovery**. Modern executable
first-hit timing remains unverified.

The referenced `EliteGoblinAbility` grants five seconds of invisibility with
one activation and no damage, movement or attack-speed boost. All six tiers
inherit that ability. Actual version-195 Storage fights hit immediately on
arrival at 0.4/1.5 seconds from near/far drops, repeat every second, and deal
240/380 damage at the first/last tier.

## Recording version 196

Carried Sneaky Goblins spend the full charge after arrival at an eligible
resource, ordinary building, blocking Wall or ground defender. Direct hits
retain resource priority and the source multiplier. The Town Hall, Clan
Castle, storages, mines, collectors and drills receive double damage; Walls,
Builder's Huts, other buildings and defenders receive ordinary damage.
Nearby defenders remain ignored while an eligible resource stands.

Freeze/stun hold the phase; action modifiers, remainder, replacement targets
and original body offsets use the shared controller. Actual Angry Spell
forced selection cancels the pending charge without a late resource hit.
Trap eligibility remains unchanged during invisibility.

Deployment invisibility retains its separate lifecycle clock. The current
ordinary-deployment adapter initializes it on the first simulation update,
yielding a 5.05-second deadline for a time-zero drop at 20 Hz. Freeze does
not extend or refresh it. Only a carried Sneaky Goblin enables the change.
Ordinary Goblins, defensive troops and versions 195 and earlier retain their
own rules and state shape. Saves, numerical stats and assets do not change.
Local geometry, pathfinding and lifecycle sampling remain adapters; native
executable and pixel parity are not claimed.

## Validation

`tests/attacking-sneaky-goblin-windup.test.ts` covers all six source tiers from
near/far, fresh/repeat timing, ground-only single damage, every resource class,
ordinary buildings, priority, Freeze/stun, action modifiers, remainder,
retargeting, Walls and traps. Building-class fixtures use legal level-four
structures with enough health to measure the full hit instead of clamping
to zero. Every tier verifies an active invisibility effect and positive
charge, holds the charge through expiry, then releases with unchanged damage.

Portable versions 195/196 use actual Storage deployments and actual Overgrowth
on the last eligible resource plus Freeze at a Cannon. First/last tiers compare
complete forward/backward states. Both recordings continue past invisibility
expiry and retain full troop health. In the Cannon fight, Freeze remains active
past that deadline, so the expiry checkpoint uses only actual inputs and no
injected damage or status. Actual Angry Spell levels 1/4 verify immediate
retargeting without a late resource hit. The shared targeting fixture sets
the original Goblin research tier for its optional Sneaky Goblin.

`tests/browser/attacking-sneaky-goblin-windup.spec.ts` checks current/historical
Storage and spell-controlled Cannon fights, original bodies during and after
invisibility, charge offsets, exact reverse seeks, read-only rendering, reduced
motion, asset requests and WebGL health at phone and desktop widths. Two actual
Angry Spell cases verify forced retargeting. Screenshots go to ignored
`output/playtest/`.
