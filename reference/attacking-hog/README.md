# Attacking Hog family melee phases

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The inherited [combat rows](../full-client/combat.json) define:

| Body            | Source tiers | Range     | Targeting and traversal                         |
| --------------- | ------------ | --------- | ----------------------------------------------- |
| Hog Rider       | 15           | 0.6 tiles | Prefers defenses; jumps walls.                  |
| Super Hog Rider | 12           | 0.6 tiles | Prefers defenses; jumps walls.                  |
| Super Hog       | 12           | 0.6 tiles | Prefers defenses; jumps walls.                  |
| Super Rider     | 12           | 0.4 tiles | Any ground target; walks; 200% damage to Walls. |

All 51 rows declare `AttackSpeed=1000` with no `CoolDownOverride` or
`NewTargetAttackDelay`, and cannot attack air. Under the established
[older-engine split-clock adapter](../attacking-giant/README.md), a fresh windup
and repeat period are both one second, without separate recovery. Modern
executable attack timing is unverified. The original attack clips have distinct
action frames: Hog Rider 11, Super Hog Rider 5, Hog 9 and dismounted Rider 4.

## Recording version 177

Each body now charges after reaching an eligible target, releases one direct
hit and preserves the one-second repeat at 20 Hz. Freeze/stun hold active time,
attack-speed changes scale it and a new target starts a fresh charge. Buildings,
blocking walls and ground defenders share the controller. Original poses and
wall facing follow the captured action offset. Defense preference, jumping and
the dismounted Rider's wall multiplier retain their existing rules.

The version-176 [defeat split](../attacking-super-hog/README.md) retains its
independent 1.3-second Rider flight. Each child starts its own melee clock when
it reaches a target; the parent's pending attack cannot land after defeat.
Clone deadlines, Spring suppression and linked arrival ownership are unchanged.

[Hog Rider Puppet](../official-wiki/heroes-pets/hog-rider-puppet.md) also enables
the clock when the army carries no Hogs. Its existing `RCEquipSpawnHogs` ability
summons fixed source levels 5–12 from equipment levels 1–18, independently of
Laboratory research. It releases 8–10 Hogs in groups of up to three at 250 ms
intervals. Each arrival has its own attack timer. The selected/recorded Puppet
warms that fixed-tier body art before activation; an army carrying a different
Hog tier warms both. Summon counts, tier mapping, wave spacing, Champion healing
and invisibility retain their existing rules.

Only carried Hog Rider/Super Hog Rider armies or an equipped Champion Puppet
enable the change. Versions 176 and earlier keep immediate first melee hits and
their original state. No source stats, assets, audio or save format change.

## Validation

`tests/attacking-hog-windup.test.ts` covers all 51 body tiers, near/far engagement,
repeat cadence, Freeze/stun, faster/slower clocks, retargeting, defense preference,
ground-only retaliation, wall traversal and doubled Rider wall damage. Real
Cannon fights, Monolith defeats and manually activated Puppet waves preserve
complete current/historical snapshots through portable forward and backward
seeks. All 18 equipment levels resolve their fixed source troop tier.

`tests/browser/attacking-hog-windup.spec.ts` compares full Node/Chromium states,
original body art and captured attack poses on desktop and phone, including both
split children and Puppet-only armies. It checks pre-activation fixed-tier art,
historical controls, backward seeks, reduced-motion/read-only rendering and
WebGL health. A mixed army checks both Laboratory and equipment tiers during
scouting, with their uploads batched behind the same graph load. Screenshots go
to ignored `output/playtest/`.
