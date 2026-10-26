# Archer Queen Giant Arrow

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The client item is `Piercing Arrow`; its display name is Giant Arrow.
The [equipment comparison](../official-wiki/heroes-pets/giant-arrow.md) checks all 18 levels.

Version 131 enables the activation projectile only for a recorded Queen carrying this item.
`ArcherQueenPierceProjectile` captures 750–1,500 damage, `PenetratingRadius=100` (one tile),
and +100% damage against Air Defenses. Rage and ordinary attack modifiers do not alter the
captured equipment damage. `QueenPierceProjectile` travels at 35 tiles/second, follows a fixed
heading and hits both defender layers.

`ProjectileOnActivationCopyTarget=TRUE` copies the Queen's current heading: a blocking wall,
then a defending unit, then her ordinary building target, matching the native actor renderer.
An activation before the first AI assignment uses the nearest visible ordinary building;
with no target it uses the actor's initial southeast heading. The Air Defense preference is
the damage bonus and does not redirect an already aimed arrow.

The source extra range is 400 tiles. The local adapter stops the ray at the simulation map's
48-tile boundary, including its border, so an off-map arrow cannot hold a finished attack open.
The shared Super Archer collision adapter computes arrival times against expanded building
footprints and defender circles. Each object is contacted once. Invisibility does not stop
collateral damage; Overgrowth still blocks damage at the scheduled contact time. A contact on
an immune object is consumed. Both piercing families resolve together in arrival order when
this rule is enabled. An airborne arrow survives the Queen's defeat or Recall.

The original body and both trail emitters reuse the full-client projectile/effect packs, with
no additional image assets. The body has a one-frame root with a ten-frame animated child;
the new presentation keeps that child clock running. The trail applies its parent effect's
120% scale and 70% lifetime. Older projectiles retain their previous interpretation. The
25-unit launch offset remains a visual offset, separate from the physical ray. These source
rows declare no sound, so contact feedback does not substitute a normal Queen hit sample.

The arrow remains a captured ray rather than a troop actor. Its standalone construct identity
for Spell Tower interactions is not modeled. The existing damage hook can still observe hits
associated with an ordinary surviving attacker; this does not establish full construct parity.

The immutable journal reconstructs body and trail through portable imports and backward seeks.
Reduced motion suppresses moving art while preserving combat and stationary contact feedback.
Flight-pack revisions also repaint paused playback after a delayed graph or texture recovers.

`tests/native-giant-arrow.test.ts` covers all levels, targeting, both defender layers, immune
contacts, source bonuses, Rage, mixed piercing arrivals, Recall, defeat, map exit and portable
seeks. `tests/native-giant-arrow-art.test.ts` checks original graph sampling, descendant clocks,
source trail scale/lifetime and legacy behavior. Browser checks cover desktop/phone rendering,
Node state equality, delayed flight-pack recovery and historical playback, alongside Super Archer
regressions. Reproduce the reused source packs with the existing native-art Python environment:

```sh
PYTHONPATH=scripts python scripts/import-native-combat.py --check
PYTHONPATH=scripts python scripts/import-native-projectile-art.py --check
PYTHONPATH=scripts python scripts/import-native-effect-art.py --check
```
