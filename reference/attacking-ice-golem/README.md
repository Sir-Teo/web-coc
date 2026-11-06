# Attacking Ice Golem phases and melee frost

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All nine inherited `characters.Ice Golem` rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=2000`, `AttackRange=100`, `FrostOnHitTime=2000` and
`FrostOnHitPercent=50`, with ground-only targeting and defense preference. The
[pinned wiki comparison](../official-wiki/troops/ice-golem.md) explicitly includes
defending units among the targets chilled by a melee hit.

There is no `CoolDownOverride` or `NewTargetAttackDelay`. The older
[LogicAttackerItemData](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/Data/LogicAttackerItemData.cs)
and [LogicCombatComponent](https://github.com/bns34/Supercell.Magic-my-turn/blob/52c5953f5e5802c64ac36e53d5599f8700976085/Supercell.Magic.Logic/GameObject/Component/LogicCombatComponent.cs)
corroborate the established split-clock adapter: 1.5 s fresh windup, 0.5 s recovery,
2 s period. Modern executable attack timing is unverified.

## Recording version 172

An actual level-one deployment previously removed 48 HP from a Storage on the
first in-range update. The new shared controller starts its windup on engagement,
releases one direct hit, then preserves recovery and timer overshoot. Freeze/stun
hold both phases, attack-speed modifiers scale them, and retargeting spends
remaining recovery once. Buildings, blocking walls and ground defenders use the
same clock. Existing defense/commitment preference and routing remain in place.
Original poses and wall facing follow the captured action-frame offset.

The old direct defender-hit path also discarded the source frost fields. Each
new melee contact now passes its two-second, 50% frost to the existing defender
status system. Its existing local adapter slows both movement and attack clocks,
multiplies retained Poison scales, replaces frost on a later hit and expires at
the captured deadline. Living original defender bodies use the existing blue
status tint. Exact modern engine slow composition remains unverified. Air targets
are ineligible; lethal contacts do not create a fresh frost on the dead body.

Only carried Ice Golem armies enable these rules. Versions 171 and earlier retain
their immediate first hits and absence of defender melee frost. Source damage,
HP, building frost and death spells are unchanged; no new asset or save format is
required. Local projection, movement and geometry conventions remain in effect.

## Validation

`tests/attacking-ice-golem-windup.test.ts` checks all nine source levels, near/far
engagement, first/repeat damage, building and defender frost, expiry/refresh,
ground-only direct hits, Freeze/stun, retarget recovery and defense preference.
Portable cases use actual Cannon fights or an actual Archer lure that releases
a Clan Castle Golem before the Ice Golem deploys. They compare complete current
and historical battle snapshots in both seek directions at levels 1 and 9.

`tests/browser/attacking-ice-golem-windup.spec.ts` compares full Node/Chromium states
on desktop and phone, checks original attacker/defender meshes, negative windup
offsets and the real defender's blue tint, and verifies historical playback,
reverse seeks, reduced-motion/read-only rendering and WebGL health. Screenshots
are written under ignored `output/playtest/`.

## Army information

The Army panel resolves the active death ability's `SelfSpell` and `SelfSpellLevel` to
show its Freeze duration and radius, alongside the parent's source hit chill. Base and
maximum research show 4 s and 9 s respectively, with a 7.5-tile radius and a two-second,
50% hit slow. The existing local spell adapter applies `FreezeTimeMS` uniformly inside
`Radius`; the native `FreezeOuterTimeMS` field is not modeled. This
information update changes no spell or combat behavior. Chromium and WebKit checks cover
source values, researched tiers, scrolling and controls at three viewport sizes.

## Defending Ice Golem, recording version 235

Portable Clan Castle rosters now admit Ice Golem level five. Its pinned
`DefensiveTroop` substitution resolves **Defensive Ice Golem**, not the attacking
row: 3,400 HP, 80 damage per two-second period, a 1.5-second fresh windup and
0.5-second recovery. Existing garrison hit frost applies the source two-second,
50% slow. The source `IceGolem_lvl5` block uses the original level-three exports
at Scale 115; the captured graph retains all three directions, both attack
variants, idle/walk timelines and original texture regions. The common original
death clip remains shared. Previous character assets are unchanged.

`IceGolemOnDeathDEF` level five casts `IceGolemFreeze_DEF` level five once at the
recorded death point. It uses the existing native defensive spell adapter:
DeployTimeMS 0 + ChargingTimeMS 300 + HitTimeMS 400, then a single pulse freezes
eligible ground/air attackers for three seconds inside 5.5 tiles. Dead, ejected,
recalled, unborn and burrowed units retain the adapter's exclusions. Friendly
buildings and defenders are not frozen. The attacking spell's seven seconds and
7.5 tiles are not used. `FreezeOuterTimeMS=2475` is retained in the source but
remains unmodelled, as in the existing attacking spell implementation. The exact
modern executable's range, duration and timing interpretation is unverified.

The defensive deployment's original `freeze_spell_01.ogg` cue uses its source
80% volume and fixed 90% pitch at death. It reuses an existing audio file. The
body, ordinary attack/death samples, blue unit status and existing spell ring are
integrated; the defensive spell's original ground frost emitters remain a visual
fidelity gap. Zero-damage freeze never creates Electro Dragon lightning bolts.

`tests/ice-golem-garrison.test.ts` covers source values, split windup, hit frost,
range boundaries, allegiance/exclusions, delayed pulse, one cast per death,
version gating and a real lure/kill/freeze/thaw recording in both seek directions.
Character source tests verify all retained geometry, timelines, UV regions and
pixels. Sound checks include the extra native death-spell cue.

Bane of the Ring remains withheld. Its pinned source guide
`TH13_Hybrid_Wait_For_Queen` waits for object `500000108`, which is absent from
all source entity arrays. The importer refuses to substitute a building. The
readiness audit now records missing wait targets across all nineteen lessons;
Miner Mania independently references absent object `500000234`. Native handling
of these missing targets requires verification before either guide can ship.
