# Attacking Electro Titan whip timing and independent aura

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All five inherited `characters.Electro Titan` rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=1500`, `AttackRange=125`, no cooldown override or initial
charge, and ground/air targeting. The source declares no ordinary projectile.
The [pinned wiki comparison](../official-wiki/troops/electro-titan.md) describes
her short whip as ranged, with 1.25-tile reach and a 1.5 s period.

Under the established [older-engine split-clock adapter](../attacking-giant/README.md),
the 1500 ms interval has no separate recovery and needs a full 1.5 s fresh windup.
Modern executable timing parity is unverified.

## Recording version 174

The old controller released a whip on the first in-range update. Electro Titan
now starts a fresh windup on engagement, holds it through Freeze/stun, and scales
it with the existing attack-clock modifiers. A completed whip releases one direct
hit against the committed building, blocking wall, ground defender or air defender.
The shared controller enables the source air-target flag for this family, and an
air contact retains its presentation height hint. Original actor poses follow
the captured action-frame offset. Existing movement and retaliation rules remain.

Her `Electro Titan Aura` remains separate: source levels deal 30/40/50/55/60 damage
every 400 ms within 3.5 tiles, with Wall immunity and 25% Hero damage. Its existing
spell controller runs independently of ordinary attacks and continues while
Freeze holds the whip. It is neither charged nor rescheduled by the new attack
clock. Source aura damage, phase, immunity and local footprint geometry do not
change. Native aura startup timing and modern slow composition are not newly
claimed.

Only carried Electro Titan armies enable this boundary. Versions 173 and earlier
retain their immediate first hits and original state. No source stats, assets,
audio or save format changes are required.

## Validation

`tests/attacking-electro-titan-windup.test.ts` checks all five source levels,
near/far engagement, independently transcribed whip and aura damage, exact
periods, Freeze and action-speed changes, direct air targeting, and blocking Wall
hits with aura immunity. Portable cases use an actual Cannon or an Archer lure
that releases a real Clan Castle Golem/Dragon. First/last-level current and
historical recordings retain complete snapshots through forward and reverse
seeks.

Ice Golem, Root Rider and Electro Titan now share the test-only fixture builder
in `tests/fixtures/native-direct-attacks.ts`; their wrappers retain the original
recording APIs and individual replay boundaries. Their existing suites and Witch
air-target tests cover the shared controller and fixture extraction.

`tests/browser/attacking-electro-titan-windup.spec.ts` verifies full Node/Chromium
states, original Titan and ground/air guard meshes, action offsets, historical
playback, reverse seeks, reduced-motion/read-only rendering and WebGL health on
desktop and phone. Screenshots are written under ignored `output/playtest/`.
