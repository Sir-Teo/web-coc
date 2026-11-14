# Native animation loop metadata

The shared native-pose cache derives the complete animation repeat period on first use.
Previously, this expanded all timeline placements into an array and then scanned every
placement list again for each distinct child slot. Repeated timeline entries often refer
to the same frame. The revised path counts each slot once per distinct frame, preserving
first-appearance order and ignoring duplicate placements within a frame.

This changes cache metadata only, not animation sampling, loop clocks, artwork, geometry,
GPU quality, or simulation. Removed children still reset their clocks; continuously
present children still contribute independent periods. Existing period/warmup bounds,
cycle handling, graph-identity cache lifetime and unsupported-clock fallbacks remain.

## Reproduction

`node scripts/native-loop-benchmark.mjs --runs=7` exercises cold metadata across all shipped
native scene graphs with two warmups. JSON parsing and shallow graph-identity cloning are
outside timing; each measured run uses fresh identities. The output includes a SHA-256
of computed cache frame identities to compare revisions. This is a CPU microbenchmark,
not a browser startup or frame-rate measurement. It analyzes every shipped export,
including exports not necessarily reached in one game session.

On this Linux/Node 24 cloud host, 568 graphs and 5,504 exports produced identical digest
`7fc1ec4d88312d22fe302776c20565d4152bbd7e53f142aa64af156d4af8439d` before and after.
Seven-run medians were 43.96 ms before and 37.23 ms after (15.3% lower). A second
verification alternated old/new functions in the same process, with three warmups and
15 measured runs each: 39.17 ms before versus 35.09 ms after (10.4% lower), again with
the same digest. Individual runs varied, so this modest first-use CPU saving must not
be described as an overall FPS gain.

Validation: 61 tests across native-loop-period, native-mesh, native-scene and
native-scene-flatten passed, plus TypeScript checking. New regressions cover repeated
frame references, duplicate slot placements, and intermittently present children.
Browser measurements could not run here: system Chromium failed to create its local
process-singleton socket (`Operation not permitted`), including the supported escalated
retry. No browser correctness or real-device speed improvement is claimed.
