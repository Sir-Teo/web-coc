# Attacking Barbarian and King Puppet source charges

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All thirteen `characters.Barbarian` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1000`,
no cooldown override or new-target delay, 0.4-tile range, 2.2-tile/s movement
and ground-only single-target melee. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives
**one-second fresh and repeat charges with zero recovery**. Modern executable
first-hit timing remains unverified.

## Recording version 192

Carried ordinary Barbarians and active Barbarian Puppet summons spend the
full charge after reaching a building, Wall or eligible defender. The direct
swing applies one hit at release. The shared controller retains Freeze/stun
holds, action modifiers, timer remainder, replacement-target charges and
original body phase offsets. A real Angry Spell cancels the committed charge
when it forces defense selection, preventing a late hit on the former target.
Legacy movement and selection remain in use; legacy King proxy units are
excluded from the ordinary-Barbarian charge.
Enemy garrison Barbarians use their separate defensive controller.

King Puppet summons copy the researched Barbarian tier and retain their
source waves and given boosts. Equipment tiers 1/18 summon 8/44 troops in
waves of at most five every 0.5 seconds. Their twenty-second given boosts
add 1.2/3.6 tiles/s and multiply damage by 2/3.2. They grant no attack-speed
bonus. Boost expiry follows battle time even when Freeze holds a charge.
Only carried Barbarians or an active source Barbarian Puppet enable this
capability. Versions 191 and earlier preserve immediate first swings and
their former state shape. Village saves, numerical stats and assets do not
change. Local geometry, crowd separation and pathfinding remain adapters;
native pixel or executable parity is not claimed.

## Validation

`tests/attacking-barbarian-windup.test.ts` checks all thirteen source tiers
from near/far, direct damage, ground-only defender selection, Freeze/stun,
faster/slower actions, sub-step remainder, retargeting, blocking Walls and
trap eligibility. Storage recordings approach from the east so the small
original body is visible in front of the building. Portable Storage fights and actual Archer-lured Golems
held by a real Freeze cast compare complete forward/backward states under
versions 191/192, with no injected health or status.

Actual King activations cover equipment tiers 1/18 and research levels 1/13,
with no trained Barbarian carried. They verify spawn stock, tiers, first
charge, actual boosted damage and movement, unchanged attack rate and full
portable states. The recorded actor is the first initial-wave summon that
engages, since crowd separation can hold others behind the King. Controlled
Freeze cases separately verify an active boost expires without advancing
the charge. Actual Angry Spell levels 1/4 compare a pending charge, immediate
retargeting without an old-target hit, and full portable states under both
191/192. Shrink checks retain damage per hit while doubling the fresh charge;
traveling units spend no charge time. Historical field comparisons explicitly
use versions 127/126, and the former independent Puppet-boost witness uses
191. Current Puppet boosts retain the source-level, wave and expiry checks.

`tests/browser/attacking-barbarian-windup.spec.ts` checks current/historical
Storage, Freeze/Golem and Puppet recordings at phone and desktop widths.
It compares complete states, original meshes, phase offsets, reverse seeks,
read-only rendering, reduced motion, asset requests and WebGL health.
Two additional actual Angry Spell cases verify the charge cancellation and
complete states in Chromium. Existing village details/save/reload, reduced-motion
camp presentation and King Puppet preloads retain coverage. Screenshots go to
ignored `output/playtest/`.
