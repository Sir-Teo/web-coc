# Ruin Witch rubble reachability

Pinned client **18.400.21**, bundle `7f04bdfdc4124b1f49308423bb8f4aa8b137aae3`.
The [Ruin Witch dossier](../official-wiki/troops/ruin-witch.md) describes an
attacking rubble seeker that ignores debris sealed inside a closed wall
compartment, as well as invisible or overgrown rubble. It cannot attack to open
a route. The existing ordinary attacker pathfinder treats walls as traversable
at a breaking cost; that route needs an attacker to stop and break each wall.

A real Thrower creates rubble by shooting over a closed ring of 32 level-18
walls. It then destroys another Gold Mine outside the ring. In version 219,
Ruin Witch follows the ordinary breaking-cost route without attacking the wall:
at five seconds she is already at x=12.77 inside the still-closed ring, consumes
the inner pile and summons a Knight. The walls remain alive throughout. The
portable witnesses use real deployment inputs and natural building destruction.

Version **220** makes new carried Ruin Witch armies select visible rubble in
their connected area of open ground. A closed pile is skipped in favor of a
reachable one; if none is available the Witch waits and retries. A pile hidden
while she approaches invalidates her selection and path. Expiring Invisibility
or Overgrowth and a newly opened wall make it eligible again. Already committed
vacuum, windup and pending-summon behavior retain their existing rules.

Both whole-tile practice routes and native campaign sub-tile routes retain their
own collision resolution. The optional strict path mode blocks walls instead of
charging a breaking cost and finds a longer open detour when necessary. Jump
Spell's shared passable-wall list supplies legal crossings. If coverage ends
with a body on a wall, it can leave toward the nearest adjacent open region
without walking through further wall cells. Goal selection
checks the rubble footprint's connected region, so a pile behind a closed wall
cannot be selected merely because its interaction radius reaches outside.
Ordinary attackers keep their default breaking-cost search and original memo keys.

The collision grids lazily build and retain a component map only when a rubble
seeker requests it. Every building geometry/standing-state snapshot owns its own
map, and strict/ordinary path results have separate keys. Multiple piles do not
each require a failed full-map search. Cached components are runtime helpers,
not battle metadata or serialized state. Opening walls, changing Jump coverage,
new battles and reverse seeks use the existing grid/cache invalidation rules.
The local grid and deterministic A* conventions are retained; precise modern
native executable routing has not been independently verified.

Only initial armies carrying Ruin Witch enable `nativeRuinWitchRubbleRoutes`.
Version 219 and earlier preserve their previous selection, wall-crossing path
and complete state. Wall-free practice witnesses retain identical version-219
physical snapshots after removing the new capability flag. This boundary does
not change the [version-219 Knight attacks](../attacking-ruin-knight/README.md),
summon stock, vacuum/cast timing, health decay, combat stats or assets.

`tests/ruin-witch-rubble-routes.test.ts` checks all four tiers on whole tiles and
sub-tiles, closed/open rings, waiting and retries, new openings, a real Jump cast,
hidden/overgrown piles, a target hidden while approaching, a longer legal detour,
cache separation/invalidation, post-Jump wall departure, wall-free physical parity and complete current/
historical portable forward/reverse seeks. Four complete version-219 witness
hashes were captured twice before the change and remain pinned. Artificial status
and sub-tile overrides are confined to isolated model scenarios; portable fixtures
keep their real practice metadata and unmodified deployment/combat inputs.

`tests/browser/ruin-witch-rubble-routes.spec.ts` compares complete Node/browser
states on phone and desktop for minimum/maximum research, current/historical
recordings and closed/open approaches. It checks the original Witch mesh,
read-only rendering, rewind, reduced motion and WebGL health. Screenshots stay
in ignored `output/playtest/`. Existing ordinary pathfinding and collision suites
also cover the shared path code.
