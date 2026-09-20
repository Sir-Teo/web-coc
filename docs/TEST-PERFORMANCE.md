# Test performance

Vitest isolates test files and runs up to eight workers. The simulation and replay
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

Do not turn off isolation globally: suites with `vi.mock` need independent module
state. Increasing worker count can increase memory and contention without improving
wall time. Investigate a slow or stuck test before raising its timeout.
