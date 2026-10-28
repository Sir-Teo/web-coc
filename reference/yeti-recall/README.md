# Normal and Super Yeti stock through Recall

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Yeti dossier](../official-wiki/troops/yeti.md), revision **624065**, and
[Super Yeti dossier](../official-wiki/spells-siege-super/super-yeti.md), revision **623186**,
describe finite mite stocks with any remainder released on death. The client abilities
`YetiSpawnYetiMites` and `SuperYetiSpawnYetiMites` declare the same stock limits, child levels
and `SpawnRemainingTroopsOnDeath=TRUE`.

| Troop level | Yeti stock | Super Yeti stock |
| ----------- | ---------- | ---------------- |
| 1           | 8          | 7                |
| 2           | 9          | 8                |
| 3           | 10         | 9                |
| 4           | 11         | 10               |
| 5           | 12         | 11               |
| 6           | 13         | 12               |
| 7           | 13         | 13               |
| 8           | 14         | 14               |

`SpawnnedTroopsPerDamage` is 600 for normal Yeti and 400 for Super Yeti. Spawned Yetimites and
Electromites retain the parent's source level. The Super Yeti wiki has conflicting 400 versus
400-then-800 descriptions; the existing source-backed 400-damage rule is retained. The first
two Super Yeti source tiers include the wiki's event/spotlight history.

Previously Recall preserved a troop's health but discarded both accumulated incoming damage
and its released-child count. A level-1 Yeti that released one Yetimite, returned through
Recall, then died released another eight, exceeding its stock. Partial damage thresholds were
also lost. The same reset affected Super Yeti's Electromites.

Version 145 captures both counters in a queue for that troop type, alongside the existing
first-recalled/first-redeployed health queue. Deployment consumes the matching counters before
upkeep. Two normal Yetis retain their individual totals; normal and Super Yeti use separate
queues even when the player reverses their return order. A held card accumulates no damage
or releases. Only a setup carrying one of these troop types enables the correction. Fresh
unrecalled troops start with their original stock, and versions 144 and earlier keep the reset.

This is a local adapter for the engine's body replacement during Recall. Source damage, stocks,
death rules and the existing body-ID-based spawn placement remain unchanged. No general status
or buff carry is inferred. Cloned and secondary units retain the existing Recall eligibility
rules. Without Recall, complete current battle states equal version 144 after removing the
capability flag.

The no-Recall parity comparison is pinned to version 145 against 144. Version
175 subsequently adds the parents' source claw windups; its
[actual fight and near-Cannon Recall recordings](../attacking-yeti/README.md)
retain complete current snapshots and verify a fresh return charge alongside
the preserved stock queues.

Regressions cover all eight stock/child tiers for both troop types, partial thresholds, a fully
spent stock, death remainder, two independent same-type units and reverse-order mixed returns.
Actual Cannon/Recall recordings at levels 1 and 8 retain 256 prior damage; 384 new damage then
releases a Yetimite, or 256 new damage releases an Electromite. Complete portable forward and
backward snapshots match in Node and Chromium. Desktop/phone checks inspect original parent
and child meshes, historical playback, reduced motion and read-only redraws.
