import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, validateReport } from './battle-sim-compare.mjs';
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
    const args = [script, `--baseline=${dir}`, `--candidate=${dir}`, '--pairs=2', '--runs=1', '--warmup=0', `--output=${output}`];
    try {
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
