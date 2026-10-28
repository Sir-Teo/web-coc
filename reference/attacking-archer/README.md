# Attacking Archer source charges and arrows

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All fourteen `characters.Archer` tiers in
[the combat tables](../full-client/combat.json) specify `AttackSpeed=1000`,
no cooldown override or new-target delay, 3.5-tile range and ground/air
single-target attacks. The established
[older-engine split-clock adapter](../attacking-giant/README.md) gives
**one-second fresh and repeat charges with zero recovery**. Modern executable
first-hit timing remains unverified.

Projectile tiers are `Arrow_small` at levels 1–2, `_fire` at 3–4,
`_elixirFire` at 5, `_darkElixirFire` at 6 and `_darkElixirFire2` at 7–14.
All travel at 14 tiles/s with source `StartHeight=45`, ballistic presentation
and zero ballistic height. The existing local minimum native flight duration
of 0.12 seconds remains in use for very close targets. Movement remains
three tiles/s. The [wiki comparison](../official-wiki/troops/archer.md)
corroborates the period, damage, movement, range and target layers.

## Recording version 191

Carried Archers and those created by an active Archer Puppet use the native
attack path. After reaching an eligible building or defender, each spends a
full charge and releases its original tier's arrow from the ground. Damage
lands once at impact, with no splash. Freeze/stun, action-speed modifiers,
sub-step remainder, replacement targets and original body poses share the
phase controller. Ground routing still opens blocked paths through Walls;
trap eligibility is unchanged. Released shots survive defeat of the shooter.

Puppet detection uses the same source ability rows as activation and summon
preloading. It enables the rule even when no trained Archer is carried.
Spawned Archers retain their actual research tier, given effects and summon
identity. Other active Puppets and passive summon abilities do not enable it.

Versions 190 and earlier retain immediate first release, generic 18-tile/s
arrows and their former state shape. Other source stats, enemy garrison
Archers, assets, audio and the village save format are unchanged. Local
geometry, minimum flight duration and projectile adapters remain in use;
native executable and pixel parity are not claimed.

## Validation

`tests/attacking-archer-windup.test.ts` covers every source tier from near/far,
fresh/repeat timing, projectile variant/speed, ground origin, impact damage,
ground/air single hits, Freeze/stun, speed modifiers, remainder, retargeting,
Wall routing, trap eligibility and released shots. Actual Air Defense,
Archer-lured Golem and Freeze/Dragon fights compare complete portable states
forward and backward under versions 190/191. The air fight uses a real Freeze
cast before deploying the fragile Archer, with no injected health or status.
The final native-arrow case also retains the last stars after its shooter
falls. Shrink tests distinguish travel time from an engaged charge and check
a two-second shrunk first release with unchanged damage. Generic projectile
life-cycle witnesses explicitly retain version 190; Witch audio and Furnace
geometry comparisons now select their own historical feature versions.
The 288-battle authored campaign audit retains its viable opening and
veteran clear for every stage. A low-DPS Giant held by a repair Builder is
finished manually only after sustained lack of net building/Wall damage,
recent attack events and matching recent repairs from a living hut. This
does not change the simulation's battle-ending rules.

Recorded Queen activations cover both Puppet equipment tiers and Archer
research levels 1/14, with no trained Archers carried. They check the actual
spawn tier, charge, projectile and complete portable state. The shared direct
fixture now reserves separate lure/primary/spare Archers and selects the
latest matching deployment; other troop setups keep their counts. The Puppet
fixture accepts an explicit historical version.

`tests/browser/attacking-archer-windup.spec.ts` checks current/historical
phone and desktop fights, first/last-tier original bodies and arrows,
Puppet activations, phase offsets, exact reverse seeking, read-only drawing,
reduced motion, asset requests and WebGL health. Screenshots go to ignored
`output/playtest/`.
The generic arrow-feedback browser witness explicitly retains version 190;
starter research/reload and active Archer Puppet preloading keep current
engine coverage.
