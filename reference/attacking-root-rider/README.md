# Attacking Root Rider windup and independent wall aura

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All four inherited `characters.Root Rider` rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=2200`, `AttackRange=100`, defense preference and ground-only
melee targeting. There is no `CoolDownOverride` or `NewTargetAttackDelay`. Under
the same [older-engine split-clock adapter](../attacking-giant/README.md), the
fresh windup is 1.5 s, recovery 0.7 s and repeat period 2.2 s. Modern executable
timing parity is unverified.

The source separately assigns `AuraSpell=TreantWallDamageAura`. Its one source
level declares 4000 damage, radius 75 (0.75 tile), 400 ms between hits and immunity
to every building class except Walls, plus Heroes, Guardians and other characters.
`IsJumper=TRUE` preserves movement over Walls. The [pinned wiki comparison](../official-wiki/troops/root-rider.md)
corroborates 10,000 wall DPS independently of the Rider's ordinary melee hits.

## Recording version 173

The previous first in-range update dealt an immediate 209 damage at level one.
The Rider now starts the shared windup after her approach, releases one direct
hit, and retains recovery and negative timer overshoot for exact 2.2 s repeats.
Freeze/stun hold both phases, action-speed modifiers scale both, and a retarget
spends remaining recovery once. Buildings and ground defenders share the clock;
defense preference, wall crossing and native routing retain their existing rules.
Original poses use the captured action-frame offset.

The wall aura continues through the existing spell controller before attack
upkeep. It is not rescheduled or charged by a melee swing. Its existing deployment
phase and local footprint-distance geometry remain unchanged. A normal-speed
Rider destroys a level-15 Wall while crossing it; a speed-boosted Rider crosses
before the same aura pulses can finish it. Exact native engine projection,
footprint geometry and aura startup timing are not newly claimed.

Only carried Root Rider armies enable the new attack clock. Versions 172 and
earlier retain their immediate first hits and original combat state. No source
stat, art, audio, save or aura rule changes are required.

## Validation

`tests/attacking-root-rider-windup.test.ts` checks every source level, near/far
engagement, first/repeat damage, Freeze/stun, action-speed changes, recovery
retargeting and defense preference. Ordinary and boosted Wall crossings retain
exact version-172 positions, wall HP and 400 ms pulse events without an ordinary
attack. Actual Cannon fights and Archer-lured Clan Castle reserves retain complete
current/historical snapshots through forward and backward portable seeks.

`tests/browser/attacking-root-rider-windup.spec.ts` checks full Node/Chromium states,
original Rider and guard meshes, source action offsets, historical playback,
reverse seeks, reduced-motion/read-only rendering and WebGL health on desktop
and phone. Screenshots are written under ignored `output/playtest/`.
