# Recovered trap cache boundary

Recovered Git blob `9e242611bbeb6e2bf6fdb509c02e764f3c9b8aa0` changes two
operations in `src/game/traps.ts`: it excludes nonpositive-HP units while building
the phase grid, and checks trigger radius before full unit eligibility.
The blob was retrieved and independently Git-SHA verified, but exact recovery
does not establish that every change should be restored.

## Reproducible synthetic counterexample

`stepTraps` exposes a synchronous effect callback. The existing grid stores unit
references and evaluates eligibility when each trap is processed. A first trap's
callback can raise a later unit's HP from zero to a positive value without moving
it. The baseline then sees the revived unit for a later trap. The recovered
dead-unit filter excludes it from the phase grid, so the later trap never sees it.

`tests/trap-live-eligibility-recovery.test.ts` captures this boundary plus two
controls: revival between phases and defeat during the callback. Combined with
the five existing grid-reuse tests:

| Implementation                                         | Results                                |
| ------------------------------------------------------ | -------------------------------------- |
| Baseline at `9e3b394c`                                 | 8 passed                               |
| Exact recovered blob                                   | 7 passed, callback-revival case failed |
| Recovered radius-only change, dead-unit filter removed | 8 passed                               |

This is an intentionally synthetic public-callback scenario. It is not evidence
that production visual effects revive units or that a recorded battle diverges.
Nevertheless, the unconditional comment that units cannot revive within the
phase is insufficient to prove equivalence at this function boundary. The full
recovered blob is therefore **not restored**. Production source stays unchanged.

Radius-only passing this regression does not establish a performance benefit.
Its separate measurement remains inconclusive because the shared runner's A/A
control showed substantial timing drift. No browser-speed, native-parity or
whole-battle speedup claim follows from these checks.
