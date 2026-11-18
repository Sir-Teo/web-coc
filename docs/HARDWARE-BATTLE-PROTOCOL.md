# Hardware browser and native reference checks

## Hardware setup

Use one GPU-equipped workstation with Chromium. Keep browser version, GPU
driver, power mode, display, and window placement the same across revisions.
Use hardware acceleration and record the GPU model and driver from
`chrome://gpu`, including its WebGL status. Record OS, physical device model,
and whether the runs used a visible window. `--expect-gpu` checks for that
specific model in the browser's unmasked WebGL renderer and rejects known
software renderers. The browser report is a cross-check for operator diagnostics.

The Linux cloud runner used to check this protocol had no `/dev/dri` or NVIDIA
device node. Chromium 155 reported SwiftShader. Its results qualify as
software-rendering checks. A workstation GPU run with `--mobile` still uses
the workstation GPU. Physical-phone results require a separate run on the
named phone, with its OS, browser, power and thermal conditions recorded.

## Baseline and candidate

Use `f3fc95e149c5f976c62db5677eba385952e14cc6` as the initial performance
baseline. From a clean candidate checkout containing this harness, record
both Git revisions. Create a separate baseline worktree and install locked
dependencies in both. Use the candidate's benchmark script for both servers
so the measurement code is identical.

```sh
git worktree add --detach ../web-coc-hardware-base f3fc95e149c5f976c62db5677eba385952e14cc6
(cd ../web-coc-hardware-base && npm ci)
npm ci
npx playwright install chromium
```

Run these in separate terminals from the candidate repository directory:

```sh
(cd ../web-coc-hardware-base && npm run dev -- --host 127.0.0.1 --port 5175 --strictPort)
npm run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

## Bounded headless check

Use this first on a shared workstation. Chromium stays headless and the
series makes no desktop interactions. Choose the specific model substring
from the verified headless renderer. If that probe used an installed Chrome,
set `PLAYWRIGHT_CHROMIUM` to that executable before running the series.
A successful check is a Mac or desktop
browser measurement under the recorded conditions. The mobile viewport
and Android user agent can exercise the mobile renderer policy on that
workstation.

Start the two local servers above, set `GPU_MODEL` in the shell, and run
this from the candidate checkout. The series runs one TH18 sample per
revision, using the same script and the same 2-to-3-second battle window.
It waits at most 120 seconds per invocation before requesting Chromium
shutdown. The 30-second limit applies to the live measurement itself.
A skipped or failed run leaves the pair incomplete.

```sh
set -e
: "${GPU_MODEL:?Set GPU_MODEL to the verified Chromium renderer model substring}"
mkdir -p output/playtest
evidence=$(mktemp -d output/playtest/headless-hardware-XXXXXX)
git -C ../web-coc-hardware-base rev-parse HEAD > "$evidence/baseline-revision.txt"
git rev-parse HEAD > "$evidence/candidate-revision.txt"
git hash-object scripts/battle-load-benchmark.mjs scripts/battle-browser-gpu.mjs \
  > "$evidence/harness-file-ids.txt"
for variant in baseline candidate; do
  port=5175
  if [ "$variant" = candidate ]; then port=5176; fi
  GAME_URL="http://127.0.0.1:$port" node scripts/battle-load-benchmark.mjs \
    "--expect-gpu=$GPU_MODEL" --mobile --lazyart --gl --army=th18 --level=half \
    --stage=61 --checkpoint=2 --until=3 --detail=2 --density=1 --warmup=2 \
    --seconds=30 --deadline=120 "--report=$evidence/$variant.json" \
    > "$evidence/$variant.stdout" 2> "$evidence/$variant.stderr"
done
node --input-type=module - "$evidence" <<'JS'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const [baseline, candidate] = ['baseline', 'candidate'].map((name) =>
  JSON.parse(readFileSync(`${process.argv[2]}/${name}.json`, 'utf8')),
);
for (const run of [baseline, candidate]) {
  assert.equal(run.headed, false);
  assert.equal(run.profiled, false);
  assert.equal(run.gpu.unmasked, true);
  assert(run.gpu.expectedModel);
  assert.equal(run.errors.length, 0);
  assert.equal(run.before.elapsed, 2);
  assert.equal(run.after.elapsed, 3);
  assert.equal(run.cpuRate, 1);
  for (const state of [run.before, run.after]) {
    assert.match(state.stateSha256, /^[0-9a-f]{64}$/);
    assert.deepEqual(state.canvas, [390, 844]);
    assert.equal(state.detail, 2);
  }
}
for (const field of ['environment', 'gpu', 'viewport', 'setup', 'deployed', 'rendering']) {
  assert.deepEqual(baseline[field], candidate[field], field);
}
assert.equal(baseline.before.stateSha256, candidate.before.stateSha256);
assert.equal(baseline.after.stateSha256, candidate.after.stateSha256);
console.log('Headless pair matched its workload and renderer.');
JS
```

This short pair checks feasibility and workload identity. A performance
conclusion requires repetitions and A/A controls as described below.
Use the same browser mode for every repetition and record when the
workstation was also doing other work.

## Headed confirmation

Run the series in Bash from the candidate directory. Set `gpu_model` to the
specific model substring shown by Chromium. The fixed 390×844 backbuffer at
detail 2 keeps adaptive quality from changing the measured workload. CPU
throttling is off. The device viewport and Android user agent exercise the
mobile renderer policy. These comparisons use the app's development server.

```sh
set -e
gpu_model='Apple M3'  # Replace with the model Chromium actually reports.
mkdir -p output/playtest
evidence=$(mktemp -d output/playtest/hardware-XXXXXX)
git -C ../web-coc-hardware-base rev-parse HEAD > "$evidence/baseline-revision.txt"
git rev-parse HEAD > "$evidence/candidate-revision.txt"
git hash-object scripts/battle-load-benchmark.mjs scripts/battle-browser-gpu.mjs \
  > "$evidence/harness-file-ids.txt"

run() {
  GAME_URL="http://127.0.0.1:$1" node scripts/battle-load-benchmark.mjs \
    --headed "--expect-gpu=$gpu_model" --mobile --lazyart --gl \
    "--army=$2" --level=half --stage=61 --checkpoint=2 --until=5 \
    --detail=2 --density=1 --warmup=5 --seconds=45 \
    "--report=$evidence/$2-$3.json" > "$evidence/$2-$3.stdout"
}

for army in th18 roster; do
  run 5175 "$army" discard-baseline
  run 5176 "$army" discard-candidate
  run 5175 "$army" before-a1
  run 5175 "$army" before-a2
  run 5175 "$army" pair1-a
  run 5176 "$army" pair1-b
  run 5176 "$army" pair2-b
  run 5175 "$army" pair2-a
  run 5176 "$army" pair3-b
  run 5175 "$army" pair3-a
  run 5175 "$army" pair4-a
  run 5176 "$army" pair4-b
  run 5175 "$army" after-a1
  run 5175 "$army" after-a2
done
```

Check that all reports for each army share the same starting and ending state
hashes, bookend canvas sizes, detail levels, device metrics, renderer, and
browser version. Every run must reach five battle seconds with an empty
`errors` list. Record elapsed wall time, simulated seconds per wall second,
frame interval p50/p95, and frame count per run. Compare A/B pairs in both
orders against the spread and drift of the two A/A pairs. For each
A/A pair and for drift between the two A/A pair means, divide the absolute
difference by the corresponding mean. Repeat under steadier conditions if
any of those fractions exceeds 8%. Call a change an end-to-end gain for this
scenario only if all four pairs favor it and their median fractional
improvement `(A - B) / A` exceeds each of those fractions. Publish every measured pair
and the settings if the results are inconclusive. Keep `--profile` in separate
diagnostic runs with their own report paths.

## Native reference comparison

Run the retained witnesses alongside the timing series to check
fidelity:

```sh
node --test scripts/native-projectile-axis-audit.test.mjs
npm test -- tests/native-projectile-bounce-pause.test.ts \
  tests/native-spring-oracle-link.test.ts tests/native-spring-ejection.test.ts \
  tests/native-spring-pet-damage.test.ts tests/native-mesh.test.ts
npx playwright test tests/browser/native-xbow-mesh.spec.ts
```

- The projectile oracle contains 18 synthetic axis cases. Its hold and contact
  witnesses cover specific positions and counters. Off-axis movement, moving
  targets and complete live flight timing remain open. [Projectile reference audit](NATIVE-PROJECTILE-AXIS-AUDIT.md)
- The spring oracle contains retained synthetic Android observations. The tests
  project six categories into the web engine and record two exclusions.
  [Spring oracle coverage](NATIVE-SPRING-ORACLE-COVERAGE.md)
- The checked-in X-Bow image and manifest are independently reconstructed
  source references. The browser fixture compares polygon and blend output with
  that image, then checks texture batching and graphics context recovery.
  Regenerating the independent image requires the authorized pinned source
  texture containers. The existing comparison uses the checked-in fixture.
  [Mesh rendering verification](NATIVE-MESH-RENDERING.md)

For web-to-web visual equality, also take fixed-seed frozen captures on both
servers with the same GPU and rendering settings. Use
`--checkpoint=2 --freeze --capture=path.png` with a unique `--report` and no
`--until`. Compare decoded RGBA hashes and state hashes. The native fixture
tests and these web captures leave original Android runtime parity unresolved.

A future Android runtime comparison needs an authorized capture with client
build and checksum, device/GPU and OS, exact scenario and unit/target state,
camera and display settings, and a reproducible clock or input sequence. The
retained files here supply synthetic and reconstructed references. No matched
live Android capture or GPU-equipped phone was available for this pass.

## Cloud validation

The GPU check rejected actual SwiftShader, including when the expected
substring matched it. A software TH18 run completed from two to 2.5 battle
seconds and wrote its separately named JSON report and CPU profile.
All 92 targeted model tests and the 18-case projectile audit passed. The
Chromium X-Bow fixture covered 12 source cases at DPR 2. Single-texture
batching and graphics context restoration changed zero pixels, and the
fixture reported zero GL errors. The largest per-case mean maximum-channel
error against the reconstructed reference was 0.612 on the 8-bit scale.
Two bounded headless TH18 smoke runs also matched their start and end
state hashes and rendering metadata on SwiftShader. A three-second
startup deadline closed Chromium and produced no timing report. Mac
hardware timing and headed confirmation were outside these cloud checks.
