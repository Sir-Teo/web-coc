# Super Troop boost requirements

Super Troop boosts require Town Hall 11, the original troop at its required
research level, and either 25,000 Dark Elixir or one Super Potion. A boost
lasts 72 hours; at most two can be active. The required research level is now
decoded correctly from the pinned client's **zero-based** `MinOriginalLevel`
index. For example, stored index 7 requires research level 8, not level 7.

This convention is documented in the pinned
[Super Minion comparison](../reference/official-wiki/spells-siege-super/super-minion.md),
[Rocket Balloon comparison](../reference/official-wiki/spells-siege-super/rocket-balloon.md)
and other Super Troop source references. The existing Town Hall requirement
already accounts for its source index of 10.

| Super Troop | Original troop | Required research level |
| --- | --- | ---: |
| Super Barbarian | Barbarian | 8 |
| Sneaky Goblin | Goblin | 7 |
| Super Giant | Giant | 9 |
| Super Wall Breaker | Wall Breaker | 7 |
| Super Archer | Archer | 8 |
| Super Witch | Witch | 5 |
| Inferno Dragon | Baby Dragon | 6 |
| Super Valkyrie | Valkyrie | 7 |
| Super Minion | Minion | 8 |
| Super Wizard | Wizard | 9 |
| Ice Hound | Lava Hound | 5 |
| Rocket Balloon | Balloon | 8 |
| Super Bowler | Bowler | 4 |
| Super Dragon | Dragon | 7 |
| Super Miner | Miner | 7 |
| Super Hog Rider | Hog Rider | 10 |
| Super Yeti | Yeti | 3 |

The shared requirement drives direct activation, Super Potion activation,
training availability, Army button states and labels. Troop Info shows the
boost requirement and describes activation instead of naming a misleading
production-facility level. Rejected activation names the original troop and
exact required level, and spends neither currency nor an item.

Locked Army Add buttons identify the first missing requirement: Town Hall 11,
the original troop's research level, an active boost, or the actual production
facility. Their tooltips, direct Add/Fill messages and saved-army preparation
errors use the same check. A missing or expired Super Minion boost now says
**Boost to train** instead of asking for a Dark Barracks that already exists.
Clock expiry refreshes the controls while retaining prepared troops. Ordinary
facility requirements continue to name their correct Barracks or Dark Barracks.

Saved boost deadlines and prepared troops remain intact. New training requires
the corrected research level, including when an older boost was activated one
level early. Already prepared troops can still deploy. Combat research levels,
source event tiers, saved data structure and recorded battle rules do not
change; this correction needs no replay-version bump.

`tests/super-troop-minimums.test.ts` checks all seventeen independent level
boundaries, currency and potion spending, 72-hour duration, training, unchanged
state after rejection, and deployment of an older prepared troop.
`tests/browser/super-troop-minimums.spec.ts` checks real disabled/enabled Army
buttons, accurate Info requirements, currency and potion activation, and
training on phone and desktop. Existing magic-item and troop-guide browser
checks retain their coverage.

`tests/army-training-issues.test.ts` checks the shared missing-requirement
messages, unchanged state after rejected Add/Fill/composition changes, valid
training, retained prepared compositions and clock expiry.
`tests/browser/army-training-issues.spec.ts` follows Town Hall, research,
activation and expiry through the real Army controls on phone and desktop,
then verifies an ordinary Wizard's Barracks gate.
