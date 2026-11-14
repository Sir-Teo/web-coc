# Untimed battle trajectory validation

Final battle hashes can agree even when earlier states differed. The separate
trajectory diagnostic hashes the complete JSON-serialized battle initially and
after each of 400 simulation steps at 50 ms. It compares all 401 checkpoints and
reports the first mismatch, including a case that reconverges by the last step.

```sh
node scripts/battle-sim-trajectory.mjs \
  --baseline=/absolute/baseline --candidate=/absolute/candidate \
  --army=th18 --output=/absolute/evidence/trajectory.json
```

Use `--army=roster` for the other supported workload. Both checkouts must be clean
and contain identical `battle-sim-benchmark.mjs` and `battle-sim-trajectory.mjs`
files. Port the diagnostic harness identically to both revisions before use;
different game-code commits remain allowed. Revisions and harness SHA-256 hashes
are recorded and checked again afterward. Each variant runs in a separate Node
process with a ten-minute timeout. Reports retain both trajectories and mismatch
evidence; nonzero exit means the diagnostic did not establish equivalence.

The benchmark's `--verify-only` path performs this diagnostic instead of its
timing loop. It cannot be combined with profiling, warmups or repeated timing
runs. There is no checkpoint hashing in the normal timed phase. Run this
validation independently, then apply the existing A/A-calibrated timing protocol
if performance measurement is appropriate. A matching trajectory does not make
a noisy timing experiment valid.

## What this establishes

- Matching serialized battle state at every 50 ms boundary for this workload.
- Stronger evidence than equality of the final snapshot alone.
- Tests deliberately diverge at step one and reconverge at step two; the
  diagnostic catches the difference despite equal final hashes.

## Limits

This is new diagnostic work, not recovery of missing commit history. It does not
observe transient changes within an individual step, nonserialized caches,
rendered frames, audio or external effects. JSON equality is deliberately strict
and can flag representation differences even if gameplay is equivalent. Neither
matching hashes nor the diagnostic's runtime proves browser performance or
native Android parity. No production gameplay or replay semantics are changed.
