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
node scripts/battle-sim-compare.mjs --baseline=/path/to/base --candidate=/path/to/candidate --army=th18 --pairs=6 --warmup=3 --runs=3 --max-aa-factor=1.05 --max-aa-log-se=0.03 --output=output/playtest/compare-th18.json
```

The two calibration budgets must be chosen explicitly before running. The values
above are illustrative, **not universal acceptable-noise thresholds**. Choose budgets
that are small relative to the effect the experiment needs to distinguish:
`--max-aa-factor=1.05` permits the A/A geometric ratio only within
`[1 / 1.05, 1.05]`; `--max-aa-log-se=0.03` caps its log-ratio standard error.
These practical rejection rules are not significance tests or confidence intervals.
Do not relax budgets after seeing results merely to obtain a passing comparison.

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
  If either phase exceeds its declared budget, execution stops with nonzero exit,
  `status: "calibration-rejected"`, a reason and `stoppedAt`. A failed initial A/A
  phase stops before any candidate process is launched. A failed trailing A/A phase
  leaves raw A/B results available but does not validate their performance conclusion.
- All observed battle hashes must agree; any disagreement invalidates comparison.
  Hash equality is a regression check for this scenario, not comprehensive parity.
- Reports retain raw results, exact commits, clean-tree state, harness digest,
  Node/platform/CPU metadata and protocol settings. Incomplete/failed runs lack
  `completedAt`; never report them as completed experiments. A completed report
  means the protocol and budget checks finished, not that a speedup was demonstrated.
- Checkout identity is checked again at completion. Keep dependency versions,
  runtime, power mode and machine load comparable. Record external conditions
  alongside the report; CPU model alone does not capture thermal/power state.

## Interpretation

Wall time remains the prespecified primary metric for the calibration gate. When all
processes supply thread-CPU timing, each phase also reports that metric separately as
`threadCpu`. It is diagnostic: never switch to whichever metric makes a candidate look
favorable. Optional CPU metrics must be valid for every battle within a process or
absent for all of them.

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

## Calibration evidence motivating the gate

A quiet-coordinated 2026-11-14 experiment on baseline `4ede47ef` still showed an
apparent 20.7% improvement between identical baseline processes across six A/A pairs
(log-ratio standard error 0.160). Individual thread-CPU ratios also varied from 0.436
to 1.244, close to wall-time ratios 0.447 to 1.237. This observation does not establish
a specific cause for the noise, and CPU timing did not rescue that comparison.
The experiment was stopped as inconclusive; the trap candidate was not merged.
The gate automates early rejection of such unusable calibration. Passing it does not
eliminate all noise, establish causality, or remove the need for independent repeats.
