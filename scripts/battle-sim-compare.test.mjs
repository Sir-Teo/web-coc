import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, validateReport, calibrationFailure } from './battle-sim-compare.mjs';
test('process-pair geometric ratios and spread', () => {
  const result = summarize([{ a: 100, b: 50 }, { a: 200, b: 100 }]);
  assert.equal(result.geometricRatioBOverA, 0.5);
  assert.equal(result.percentReduction, 50);
  assert.equal(result.logRatioStandardError, 0);
});
test('A/A is zero reduction; invalid metrics rejected', () => {
  assert.equal(summarize([{ a: 1, b: 1 }, { a: 2, b: 2 }]).percentReduction, 0);
  assert.throws(() => summarize([{ a: 1, b: 1 }]));
  assert.throws(() => summarize([{ a: 0, b: 1 }, { a: 1, b: Infinity }]));
});
test('within-process battles aggregate into one observation', () => {
  const run = { totalMs: 10, hash: 'a'.repeat(64), activeSteps: 400, profiled: false };
  assert.equal(validateReport({ runs: [run, { ...run, totalMs: 30 }] }).totalMs, 20);
  assert.throws(() => validateReport({ ...run, profiled: true }));
  assert.throws(() => validateReport({ runs: [run, { ...run, hash: 'b'.repeat(64) }] }));
  assert.throws(() => validateReport({ runs: [] }));
});

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
test('CLI records balanced fresh-process A/A and A/B phases; rejects dirty trees', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-compare-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, 'scripts/battle-sim-benchmark.mjs'),
      `console.log(JSON.stringify({totalMs:10,hash:'a'.repeat(64),activeSteps:400,profiled:false,pid:process.pid}));`);
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init'); git('add', '.');
    git('-c', 'user.name=Benchmark Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'fixture');
    const output = path.join(os.tmpdir(), `battle-report-${process.pid}.json`);
    const script = fileURLToPath(new URL('./battle-sim-compare.mjs', import.meta.url));
    const args = [script, `--baseline=${dir}`, `--candidate=${dir}`, '--pairs=2', '--runs=1', '--warmup=0', '--max-aa-factor=1.05', '--max-aa-log-se=0.03', `--output=${output}`];
    try {
      const missingBudget = spawnSync(process.execPath,
        args.filter(arg => !arg.startsWith('--max-aa-')), { encoding: 'utf8' });
      assert.equal(missingBudget.status, 1);
      assert.match(missingBudget.stderr, /Declare finite --max-aa-factor/);
      assert.equal(fs.existsSync(output), false);
      execFileSync(process.execPath, args, { stdio: 'pipe' });
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.ok(report.completedAt);
      assert.equal(report.observations.length, 12);
      assert.equal(new Set(report.observations.map(o => o.raw.pid)).size, 12);
      assert.deepEqual(report.observations.slice(0, 4).map(o => o.label), ['a', 'b', 'b', 'a']);
      assert.equal(report.summaries.ab.percentReduction, 0);
      fs.writeFileSync(path.join(dir, 'dirty'), 'x');
      assert.notEqual(spawnSync(process.execPath, args).status, 0);
    } finally { fs.rmSync(output, { force: true }); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('calibration budgets are explicit, symmetric and inclusive', () => {
  const budget = { maxFactor: 1.05, maxLogSE: 0.03 };
  assert.equal(calibrationFailure({ geometricRatioBOverA: 1.05, logRatioStandardError: 0.03 }, budget), null);
  assert.equal(calibrationFailure({ geometricRatioBOverA: 1 / 1.05, logRatioStandardError: 0 }, budget), null);
  assert.match(calibrationFailure({ geometricRatioBOverA: 0.9, logRatioStandardError: 0 }, budget), /drift/);
  assert.match(calibrationFailure({ geometricRatioBOverA: 1, logRatioStandardError: 0.031 }, budget), /variability/);
  assert.throws(() => calibrationFailure({}, { maxFactor: NaN, maxLogSE: 0 }));
  assert.throws(() => calibrationFailure({}, { maxFactor: 1, maxLogSE: -1 }));
});

test('thread CPU observations aggregate without silently accepting partial metrics', () => {
  const run = { totalMs: 10, hash: 'a'.repeat(64), activeSteps: 400, threadCpuMs: 5 };
  assert.equal(validateReport({ runs: [run, { ...run, threadCpuMs: 15 }] }).threadCpuMs, 10);
  assert.throws(() => validateReport({ runs: [run, { ...run, threadCpuMs: undefined }] }));
  assert.throws(() => validateReport({ ...run, threadCpuMs: 0 }));
});

test('CLI stops at failed before/after calibration and preserves incomplete evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battle-calibration-test-'));
  const output = path.join(os.tmpdir(), `calibration-report-${process.pid}.json`);
  try {
    fs.mkdirSync(path.join(dir, 'scripts'));
    fs.writeFileSync(path.join(dir, '.gitignore'), '.counter\n');
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'pipe' });
    git('init');
    for (const [phase, stableObservations] of [['aa-before', 0], ['aa-after', 8]]) {
      fs.rmSync(path.join(dir, '.counter'), { force: true });
      fs.writeFileSync(path.join(dir, 'scripts/battle-sim-benchmark.mjs'), `
        import fs from 'node:fs';
        const n = fs.existsSync('.counter') ? Number(fs.readFileSync('.counter', 'utf8')) : 0;
        fs.writeFileSync('.counter', String(n + 1));
        const totalMs = n < ${stableObservations} ? 10 : n % 2 ? 100 : 10;
        console.log(JSON.stringify({totalMs,threadCpuMs:totalMs/2,hash:'a'.repeat(64),activeSteps:400}));
      `);
      git('add', '.');
      git('-c', 'user.name=Benchmark Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', phase);
      const result = spawnSync(process.execPath, [fileURLToPath(new URL('./battle-sim-compare.mjs', import.meta.url)),
        `--baseline=${dir}`, `--candidate=${dir}`, '--pairs=2', '--runs=1', '--warmup=0',
        '--max-aa-factor=1.05', '--max-aa-log-se=0.03', `--output=${output}`], { encoding: 'utf8' });
      assert.equal(result.status, 1, result.stderr);
      const report = JSON.parse(fs.readFileSync(output, 'utf8'));
      assert.equal(report.status, 'calibration-rejected');
      assert.equal(report.calibrationRejection.phase, phase);
      assert.equal(report.observations.length, stableObservations + 4);
      assert.equal(report.completedAt, undefined);
      assert.ok(report.stoppedAt);
      assert.ok(report.summaries[phase].threadCpu);
      if (phase === 'aa-before') assert.equal(report.summaries.ab, undefined);
    }
  } finally {
    fs.rmSync(output, { force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
