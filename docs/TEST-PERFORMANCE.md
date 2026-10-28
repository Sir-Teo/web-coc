# Test performance

Vitest isolates test files and runs up to eight workers, capped by the runtime's
available CPU parallelism (including container quotas). The simulation and replay
sweeps do substantially more work than ordinary unit tests; the configuration gives
them a three-minute timeout. Prefer a focused run during development and one full
run before review.

```sh
npx vitest run tests/model.test.ts
npx vitest run --reporter=json --outputFile=output/vitest-results.json
```

The JSON report includes per-file timing. Measure on the current revision and host
instead of relying on historical test counts or durations.

## Keep imports small

A simulation test should not parse presentation graphs. Render-only data belongs in
`*-graph.ts` and `*-poses.ts`, separate from the stats, names and dimensions used by
game rules. Earlier splits of castle, Inferno and defending-builder graphs removed
several megabytes from model imports.

## Keep sweeps bounded

Use explicit iteration limits and assert that timer-driven helpers make progress.
Never pass a missing completion timestamp to `GameModel.tick`; it rejects non-finite
time. The native campaign sweep is split by army so the largest workload can run
across workers. Its shared helper lives in `tests/native-campaign-combat-sweep.ts`.
The sweep keeps its simulation bounds (a 48,000-step cap and a ten-minute no-destruction
stalemate bound) separate from its wall-clock budget, a measured per-stage timeout. A
stage that reaches either bound is a legitimate unfinished raid, not a failure: on
Warden's Folly a Defending Builder repairs the last Archer's damage as fast as it lands.

Do not turn off isolation globally: suites with `vi.mock` need independent module
state. Increasing worker count can increase memory and contention without improving
wall time. Investigate a slow or stuck test before raising its timeout.

Keep historical parity comparisons at the version that introduced the feature they
verify. Comparing an old engine to `REPLAY_VERSION` also compares every later combat
change and capability flag. Fixture version parameters select both the recording's
version and its initial battle rules. Current spell and Giant interactions retain
separate complete-state forward/backward checks in `tests/giant-spell-replays.test.ts`.

## Source pixel comparisons

The on-demand [browser regression workflow](../.github/workflows/browser-regression.yml)
runs four shards per engine with one browser worker on each runner. Its 120-minute
job budget covers setup, source reconstruction, the source galleries, gameplay
checks and production runners. Source captures are substantial work: an October
2026 local Chromium run took 9.1 minutes for eleven selected gallery strips alone.

The [shared pixel comparison helper](../tests/fixtures/source-pixel-comparison.ts) reads
RGB channels directly, avoiding temporary arrays for every pixel. It validates
the captured frame and tile bounds and maps top-left tile coordinates into bottom-up
WebGL readbacks. Background detection, maximum-channel errors, the sixteen-value
significance threshold and the limit of 32 diagnostic pixels retain their original rules.

[Hand-calculated cases](../tests/source-pixel-comparison.test.ts) cover tile coordinates,
alpha-independent background detection, threshold boundaries and diagnostic truncation.
When changing the calculation, compare per-case GPU reports with the previous run as
well as retaining the existing source-pixel acceptance thresholds.

The X-Bow, Dark Elixir Storage and Goblin mesh galleries reject captures larger than
the actual framebuffer. After removing the reference image, they capture another
native frame and require zero changed pixels before saving the preview screenshot.
The other native mesh and live galleries synchronize screenshots with `postrender`
after restoring their native objects.
