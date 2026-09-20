# Test suite runtime

The model suite runs **213 files and 1,848 tests in about 5m45s** on this host
(`npx vitest run`). Before the work recorded here it did not finish at all: runs were
abandoned at 46 and then at 90 minutes.

## What was actually wrong

**One test looped forever.** `tests/townhall-tiers.test.ts` raised a building level by level with
`m.tick(built.upgradeEnd!)`. A Skeleton Trap's first row costs no time, so it is finished the
moment it is placed and never has a completion stamp; `m.tick(undefined)` then set the model
clock to `NaN`, every later timer compared false, and the loop's exit condition could never be
reached. The file appeared to hang after printing all its passing tests, because the last test
never returned. `GameModel.tick` now rejects a non-finite time outright, so a missing timestamp
fails immediately instead of silently poisoning every timer derived from it, and the helper
asserts forward progress rather than looping on it. That file now runs in about 3 seconds.

That loop also hid a stale assertion. It expected a version-46 recording to refuse a
Laboratory 16, but the Town Hall 18 ladder _arrived_ at version 46; only the three recordings
older than it refuse that level. The assertion had never executed.

**Every test file re-parsed the artwork.** Importing `src/game/model.ts` pulled 126 modules and
**7.7 MB** of JSON, and 143 of the 215 files import it — each in its own isolated worker, at
roughly 4 seconds apiece. Almost all of that JSON is render-only scene graphs that the
simulation never touches. Three modules were mixing the two concerns:

| Was                                            | Now                          | Cost removed from the simulation |
| ---------------------------------------------- | ---------------------------- | -------------------------------- |
| `defending-builder.ts` held two pose functions | `defending-builder-poses.ts` | 3.5 MB of character graphs       |
| `castle-art.ts` held `CASTLE_GRAPH`            | `castle-graph.ts`            | 947 KB                           |
| `inferno-art.ts` held `INFERNO_GRAPH`          | `inferno-graph.ts`           | 563 KB                           |

Naming a texture, reading a level's stats or stepping combat no longer parses artwork. The
model graph is down to **2.4 MB**, and a file that imports it costs about 2.7 seconds instead of
4.3. The same edges were shortening the browser bundle's critical path, not just the tests.

## Keeping it that way

`src/game/*-poses.ts` and `src/game/*-graph.ts` own the scene graphs; `*-art.ts` owns names,
portraits and measurements. A simulation module importing a graph module is a regression —
check with `python3` on the import graph before adding one.

`tsconfig.json` covers `src` only, so a rename or a module split used to leave tests importing
symbols that no longer exist, and nothing caught it until the suite ran. `npm run test:imports`
typechecks the tests too and reports only the module-resolution codes:

```sh
npm run test:imports
```

It is part of `npm run check` and of CI. It reports only those codes deliberately: the test tree
carries 25 unrelated type errors that predate the check, and gating on all of them would keep it
permanently red. Fixing those remains open.

## Wall time and CPU (2026-09-20)

The suite runs **249 files and 2,260 tests in about 27 s** on this host, using 8 workers. Two
things set that:

- **The longest file bounds the run.** The 90-stage, three-army native combat sweep was one
  file (40 s) while the rest of the suite finished in under 20 s. It is now three files over one
  helper (`tests/native-campaign-combat-sweep.ts`, one army per file), so it spreads over three
  workers. `campaign-audit.test.ts` (20 s) is the next bound; split it the same way if it grows.
- **Worker count barely moves wall time.** Vitest defaulted to one worker per logical core (18
  here); six workers finished in the same wall time, so `vitest.config.ts` caps at eight and a run
  no longer pegs every core. Total CPU is about 250 s either way: each file still imports the
  model graph in its own worker (about 60 s of the total). `--no-isolate` would cut that to
  25 s, but the suite has `vi.mock` files (spell-tower boost tests) that need isolation, and a
  shared module graph across all workers held 7.6 GB.

`npx vitest run --reporter=json --outputFile=out.json` gives per-file durations (`startTime`,
`endTime`) for finding the current bound.
