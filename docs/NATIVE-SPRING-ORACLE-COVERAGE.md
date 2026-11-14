# Retained Spring Trap oracle coverage

The fixture-driven regression in `tests/native-spring-oracle-link.test.ts` links
existing saved Android observations to current web behavior. It does **not** execute
Android instructions again, recover new functions, authenticate an APK again, or
increase measured native REA coverage. No production behavior or replay version changes.

## Evidence and provenance

The [ejection reference](../reference/native-spring-ejection-18.400.22.json) records
synthetic typed fixtures for initialization, classification and ejection, including
explicit modeled boundaries and no original-image writes. Its `source_sha256` names
the recovered executable image, **not the original APK or library file**. The separate
`original_apk_sha256` names the APK. Tests link these recorded identities to the
[reduction reference](../reference/native-trap-reduction-18.400.22.json); agreement
between recorded strings is not fresh cryptographic verification of the underlying inputs.

The combat export is labeled `18.400.21`; the executable oracle is `18.400.22`.
The four recorded CSV digests (characters, pets, buildings and traps) agree between
the export and oracle. Tests also compare every field in the oracle's eleven source
records with resolved web rows. This supports those scoped table links, not equality
of the complete clients, source trees, executable functions or all combat behavior.

## Six executable web projections, two explicit exclusions

| Retained fixture category | Web representative | Checked result |
| --- | --- | --- |
| Ordinary barracks | Archer | Pre-damage ejection |
| Ordinary dark barracks | Valkyrie | Pre-damage ejection |
| Source-protected character | Root Rider | No ejection; recorded damage |
| Source-protected pet | LASSI | No ejection; recorded reduced damage |
| Siege forced protection | Wall Wrecker | No ejection; recorded reduced damage |
| Hero category guard | Barbarian King | No ejection; recorded reduced damage |
| Siege synthetic flag override | Not projected | No corresponding public port state for the post-initialization override |
| Air-state guard | Not projected here | Outcome helper assumes an eligible target; outer `stepTraps` filtering has separate tests |

These are category representatives, not reconstructions of original Android objects.
The test explicitly accounts for all eight fixture names, so new fixture rows cannot
silently disappear from the coverage inventory. A projection is narrower than a full
native-function differential test, and is not a percentage of the game's REA completion.

## Keep the units and call boundaries separate

The oracle's raw native damage input `1401` and its synthetic `1401 HP` input are
not the same quantity. At 50% retention they yield respectively `700` native units
and `70050` native units, corresponding to `7 HP` and `700.5 HP`.
The four non-ejected projections test both input scales against the retained results.
The arbitrary-percent controls from the older reduction fixture are not all executed
through this current fixed-source Spring Trap API and are not claimed as added coverage.

The oracle measured ejection and damage helpers separately. A web target successfully
ejected before damage does not then take that independently recorded damage result.
The two ordinary projections therefore check ejection only, not an invented final HP.
Existing spring integration/replay suites continue to check version gates and whole
trap behavior; these fixture links supplement rather than replace those tests.

## Reproduce

```sh
node node_modules/vitest/vitest.mjs run tests/native-spring-oracle-link.test.ts tests/native-spring-ejection.test.ts tests/native-spring-pet-damage.test.ts --maxWorkers=2
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.tests.json
```
