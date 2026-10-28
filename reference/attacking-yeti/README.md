# Attacking Yeti family claws and Recall

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
All eight normal and eight Super Yeti rows in [the combat tables](../full-client/combat.json)
declare `AttackSpeed=1000`, `AttackRange=80`, no cooldown override or initial
charge, and ground-only melee attacks. Under the established
[older-engine split-clock adapter](../attacking-giant/README.md), the fresh
windup and repeat period are both one second, with no separate recovery. Modern
executable attack timing is unverified.

The source independently assigns finite `YetiSpawnYetiMites` /
`SuperYetiSpawnYetiMites` abilities. Their thresholds remain 600 / 400 damage,
with source-level stocks of 8–14 Yetimites / 7–14 Electromites. See the
[stock and Recall reference](../yeti-recall/README.md).

## Recording version 175

Both parents previously struck on their first in-range update. They now charge
for a full second after approaching the target and release one direct hit.
Freeze/stun hold the charge, attack-speed modifiers scale it, target changes
start a fresh charge, and timer overshoot preserves the one-second repeat at
20 Hz. Buildings, blocking walls and ground defenders use the same clock. An
alerted defender can interrupt a building charge; air defenders remain ineligible.
Original poses and committed-wall facing follow the captured action offset.

Recall can remove the old body before its pending first claw. The returning
body starts its own full windup, while the existing version-145 queues restore
accumulated incoming damage and released-mite counts before upkeep. A knockout
during a charge releases the source's remaining finite stock and no delayed
parent hit. Mite thresholds, budgets, spawn placement, death release and child
combat retain their existing rules.

Only carried Yeti/Super Yeti armies enable the new claw clock. Versions 174 and
earlier retain their immediate first hits and original combat state. No source
stats, assets, audio, save format or stock rules change.

## Validation

`tests/attacking-yeti-windup.test.ts` checks all sixteen source rows and near/far
approaches, first/repeat damage, Freeze/stun, faster/slower action clocks, target
changes, ground-only retaliation, wall timing/facing and finite death spawns.
Actual Cannon fights, Archer-lured Castle reserves and Recall during a charge
retain complete current/historical snapshots through forward and backward
portable seeks. The existing stock suite continues to cover all source budgets
and partial damage thresholds.

`tests/browser/attacking-yeti-windup.spec.ts` checks full Node/Chromium states,
original parent/guard meshes, first/last-level action offsets, Recall body
replacement, backward seeks, reduced-motion/read-only rendering and WebGL health
on desktop and phone. `tests/browser/yeti-recall-stock.spec.ts` adds current-rule
normal/Super Yeti cases alongside its version-145/144 recordings, including the
original spawned mite art. Screenshots are written under ignored `output/playtest/`.
