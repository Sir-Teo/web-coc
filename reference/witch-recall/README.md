# Witch and Super Witch summons through Recall

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Witch dossier](../official-wiki/troops/witch.md), revision **624601**, and
[Super Witch dossier](../official-wiki/spells-siege-super/super-witch.md), revision **623218**,
describe living-child limits per caster. The client character rows declare those limits;
Super Witch's `SummonLimit=1` allows one living Big Boy at every source level.

| Witch level | Skeletons per cast | Living limit | Skeleton level |
| ----------- | ------------------ | ------------ | -------------- |
| 1           | 4                  | 6            | 1              |
| 2           | 4                  | 8            | 1              |
| 3           | 4                  | 10           | 1              |
| 4           | 4                  | 12           | 1              |
| 5           | 4                  | 14           | 1              |
| 6           | 4                  | 15           | 1              |
| 7           | 5                  | 16           | 1              |
| 8           | 5                  | 16           | 2              |

Witch uses `SummonCooldown=7000` and `SummonTime=875`; Super Witch uses 25000 and 1000 and
summons one level-1 Big Boy. The existing engine adds cooldown and wind-up for the next
creation deadline. That schedule and the source stats are unchanged.

Previously Recall created a new caster body and discarded its summon state. Existing children
kept their old owner ID, so the returning body saw an empty roster and summoned immediately.
A real Super Witch recalled after her first Big Boy fully materialized could therefore keep
two living Big Boys. The same reset allowed ordinary Witches to exceed their source limits.

Version 148 keeps the logical summoner ID, total release count and next deadline alongside the
caster's recalled health. A returning body's future children use the original owner ID, and
both old and new children count toward its limit. A later vacancy can still be filled. Two
same-kind casters retain independent records in the same first-recalled/first-returned order
as their health; repeated Recall retains the first identity rather than adopting an intermediate
body's ID. Only carried Witch/Super Witch rosters enable this adapter. Existing pet summoners
and separate troop controllers keep their own rules.

A future saved deadline is retained. A deadline that passed while the caster was held becomes
ready at redeployment, preventing backdated births or a burst of historical casts. This is a
deterministic local Recall convention consistent with keeping the cooldown running while held;
the full native client Recall scheduler is unavailable. Children already committed before
Recall keep the existing materialization behavior. Versions 147 and earlier preserve their
original body-local reset. Normal combat without Recall is exactly equal after removing the
capability flag.

Regressions check all eight source levels of both casters, living caps, original ownership,
future cooldowns, a long held interval, repeated Recall, two independent same-kind casters,
replacement after a child's death, historical behavior and normal-combat equality. The arena
uses a valid campaign setup without a Home Village Guardian so capacity checks do not measure
Skeleton attrition. Real recorded deployment/Recall inputs reconstruct complete portable
forward/backward snapshots. Desktop/phone Chromium checks current and historical child counts,
original caster and child meshes, reduced motion and read-only redraws.
