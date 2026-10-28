# Recall for split Super Hog Rider units

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Super Hog Rider reference](../official-wiki/spells-siege-super/super-hog-rider.md)
and client rows give each split body five housing spaces for traps, Clone and
Recall. The [Recall reference](../official-wiki/spells-siege-super/recall-spell.md)
describes returning eligible units to the deployment bar with their current
health. Source Recall level one has 83 housing and a five-tile radius.

## Recording version 179

Previously the native Recall adapter accepted heroes and deployed trainable
troops, excluding explicitly leveled split bodies. Super Hog and Super Rider
can now return as separate reserves for the current attack. Each consumes five
housing from the existing spell budget and keeps its own health, source level
and origin. A cloned body remains ineligible. The existing priority order still
applies: heroes first, then housing, birth time and identifier.

The battle tray adds a distinct card for each returned kind, with its name,
count and displayed parent level (4–15). Both use the existing Super Hog Rider
family portrait. The tray inserts the cards without replacing its existing
buttons, then patches counts and selection live. Pointer and keyboard selection,
legal placement, and the normal hold/drag deployment path use the same reserve
count. Empty cards remain disabled after their stock is spent.

Redeployment creates a new body with the returned health and level and a fresh
one-second melee windup. The existing Recall deployment effect marks its return.
The original combined troop's deployment housing is not charged a second time.
An empty battlefield stays open while either returned reserve is available.
These reserves belong to the attack; they do not become trainable village units.
The existing Recall status-reset adapter remains in use.

Recalling the Hog during the throw leaves its sibling's linked flight and arrival
intact. A living combined parent still returns through its ordinary army card.
The [defeat split](../attacking-super-hog/README.md) and
[melee phases](../attacking-hog/README.md) otherwise retain their rules.

Only version-179 Super Hog Rider armies carrying Recall enable this adapter.
Versions 178 and earlier retain their previous exclusion of the split bodies.
The new `recalled-troop` input names only Super Hog or Super Rider; it cannot
manufacture a reserve. Portable files retain envelope version one. No source
stats, assets or village save-format changes are required.

## Validation

`tests/super-hog-recall.test.ts` covers all twelve source tiers, five-space
budgets and partial capacity, health/level/ownership preservation, fresh attack
clocks, clones, empty-field continuation, illegal/empty deployment, in-flight
sibling arrival, ordinary-parent Recall, JSON restoration and input validation.
Actual Monolith defeats, Recall casts, Freeze-protected redeployments and direct
hits preserve complete current/historical snapshots through portable forward
and backward seeks.

`tests/browser/super-hog-recall.spec.ts` uses real Recall and Freeze pointer
casts, returned-card pointer/keyboard selection, illegal and legal drops, live
counts, unchanged tray button identity and read-only replay reconstruction on
phone and desktop. It checks the first and last source tiers, the older-version
control, WebGL health and page errors. Screenshots go to ignored `output/playtest/`.
