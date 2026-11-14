# CPU battle comparison protocol

`battle-sim-compare.mjs` adds a process-isolated comparison around the existing
single-variant `battle-sim-benchmark.mjs`. It changes no gameplay or replay code.
This tooling was rebuilt independently from baseline `d1415af9`; it is not a
recovery of earlier unpublished benchmark or optimization work.

## Run

Prepare two clean, committed checkouts with dependencies installed. Each child
runs the harness from its own checkout and therefore loads that variant's own
fixtures, model, and game data. The harness files must be byte-identical. Do not
run other benchmarks, builds, browsers or CPU-heavy jobs simultaneously.

```sh
node --test scripts/battle-sim-compare.test.mjs
node scripts/battle-sim-compare.mjs --baseline=/path/to/base --candidate=/path/to/candidate --army=th18 --pairs=6 --warmup=3 --runs=3 --output=output/playtest/compare-th18.json
```

Repeat separately with `--army=roster`. For a smoke test only, use the same
checkout for both paths, `--pairs=2 --warmup=0 --runs=1`. A smoke test is not a
credible performance estimate. Commit the wrapper before comparing its checkout;
the clean-tree check intentionally rejects uncommitted source.

## What is controlled

- Every observation starts a new Node process, with one variant loaded.
- Warmup and measured battles run within that process. Repeated battles are
  averaged to **one process observation**, never treated as independent samples.
- Pair order alternates AB/BA with an even pair count, without concurrency.
- Baseline-versus-baseline (A/A) phases precede and follow candidate comparison.
  These diagnose order/system drift. They are not subtracted from A/B results.
- All observed battle hashes must agree; any disagreement invalidates comparison.
  Hash equality is a regression check for this scenario, not comprehensive parity.
- Reports retain raw results, exact commits, clean-tree state, harness digest,
  Node/platform/CPU metadata and protocol settings. Incomplete/failed runs lack
  `completedAt`; never report them as completed experiments.
- Checkout identity is checked again at completion. Keep dependency versions,
  runtime, power mode and machine load comparable. Record external conditions
  alongside the report; CPU model alone does not capture thermal/power state.

## Interpretation

The summary reports the geometric mean of paired candidate/baseline time ratios
and the standard error of their log ratios. These are descriptive, not a
confidence interval or significance test. Inspect the raw pair/order results and
both A/A phases before interpreting A/B; if drift/order bias is material relative
to the claimed improvement, repeat with more independent process pairs and better
controlled conditions. Do not cherry-pick favorable runs or scenarios. Preserve
all reports, including failed or inconclusive experiments.

This measures the sum of timed simulation steps only. Module loading, army setup,
and browser rendering are excluded; instrumentation overhead remains. It does not
measure FPS, native REA coverage, or total app latency. Profile runs are rejected.
No result from this protocol alone establishes native gameplay equivalence.
