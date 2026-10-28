# Attacking Dragon source charges

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All thirteen `characters.Dragon` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1250`,
no cooldown override or new-target delay, ground/air targeting and 0.3-tile
splash. The established [older-engine split-clock adapter](../attacking-giant/README.md)
gives **1.25-second fresh and repeat charges with zero recovery**. Modern
executable first-hit timing remains unverified.

The source has no projectile. The older pinned
[LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
resolves a projectile-free area attack immediately and selects the target's
ground or air layer. The [wiki comparison](../official-wiki/troops/dragon.md)
agrees with the attack period, damage and splash. Client range remains 2.5
tiles; the wiki reports 3.

## Recording version 189

Ordinary Dragon retains its existing movement, target selection, edge aim
for buildings, immediate flame damage, target-layer splash and breath effect.
Both buildings and eligible ground/air defenders now require a full charge.
The shared clock retains repeat remainder, pauses during Freeze/stun, scales
with action-speed changes and starts a fresh charge for replacement targets.
Original body poses use the same offset relative to `ActionFrame`.

The legacy attack adapter now serves Dragon alongside Giant and P.E.K.K.A.
Its melee release rules are unchanged. Dragon's existing direct release is
captured in a separate helper; it hits the primary once, splashes nearby
defenders on the same layer and includes buildings only for ground attacks.
The original local building-edge splash geometry remains in use. No physical
projectile or additional flight delay is introduced.

Only an initial army carrying ordinary Dragon enables the change. Versions
188 and earlier retain their previous first hit and state shape. Other dragon
families, numeric source stats, assets, audio and the village save format
are unchanged.

## Validation

`tests/attacking-dragon-windup.test.ts` covers every source tier from near and
far, fresh/repeat timing, immediate damage, absence of a physical projectile,
ground/air splash with one primary hit, neighboring structures, future-birth
exclusion, Freeze/stun, speed modifiers, sub-step remainder, replacement
targets and Wall crossing. Actual Cannon and Archer-lured Golem/Dragon fights
reconstruct complete portable states forward and backward under versions
188 and 189. Giant and P.E.K.K.A regression cases check the shared adapter.

Current campaign witnesses keep complete loot and replay checks: Invaders
now ends at 45% with one star (60% / two stars under version 188), and Magic
Practice at 14% (19% under version 188), with all three Shrink Traps still
pulsing fully. Explicit version-188 portable witnesses retain the former
outcomes. The campaign sweep also recognizes a wind stalemate only when
every surviving flyer has actually been pushed recently and is targeting
a living, recently firing Sweeper. This retains the stationary-crowd check
without rejecting a defense that is actively holding the army back.
The Magic Practice browser witness now has all four survivors still shrunk
at 36.05 seconds. It follows the still-pulsing field's latest refresh deadline
and verifies all four return to normal scale at 44.85 seconds, with the field
and later home cleanup complete.

`tests/browser/attacking-dragon-windup.spec.ts` checks current and historical
recordings on phone and desktop, original first/last-tier body meshes, charge
offsets, complete state equality, reverse seeks, read-only drawing, reduced
motion, asset requests and WebGL health. Screenshots go to ignored
`output/playtest/`.
