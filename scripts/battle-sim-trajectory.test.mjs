import test from 'node:test';
import assert from 'node:assert/strict';
import { recordTrajectory, compareTrajectories } from './battle-sim-trajectory.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function model(transient = false) {
  let steps = 0;
  return {
    battle: { value: 0 },
    step(dt) {
      assert.equal(dt, 0.05);
      this.battle.value = ++steps === 1 && transient ? 1 : 0;
    },
  };
}
test('records initial state and every step without timing metrics', () => {
  const a = recordTrajectory(model(), 2),
    b = recordTrajectory(model(), 2);
  assert.equal(a.hashes.length, 3);
  assert.deepEqual(compareTrajectories(a, b), {
    matches: true,
    checkpoints: 3,
    firstMismatchStep: null,
    finalStateMatches: true,
  });
  assert.equal(a.totalMs, undefined);
  assert.throws(() => recordTrajectory(model(), 0));
});
test('detects deliberate transient divergence even when final states reconverge', () => {
  const a = recordTrajectory(model(), 2),
    b = recordTrajectory(model(true), 2);
  assert.equal(a.hashes.at(-1), b.hashes.at(-1));
  assert.deepEqual(compareTrajectories(a, b), {
    matches: false,
    checkpoints: 3,
    firstMismatchStep: 1,
    finalStateMatches: true,
  });
});
test('rejects malformed, truncated or differently configured trajectories', () => {
  const a = recordTrajectory(model(), 2);
  for (const bad of [
    { ...a, hashes: a.hashes.slice(1) },
    { ...a, dt: NaN },
    { ...a, hashes: ['x', ...a.hashes.slice(1)] },
    { ...a, mode: 'timing' },
  ])
    assert.throws(() => compareTrajectories(a, bad));
  assert.throws(() => compareTrajectories(a, { ...a, dt: 0.1 }));
  assert.throws(() =>
    compareTrajectories({ ...a, scenario: 'th18' }, { ...a, scenario: 'roster' }),
  );
});
test('CLI preserves matched and reconvergent-mismatch evidence from separate children', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'trajectory-test-'));
  const output = path.join(dir, 'report.json');
  const script = fileURLToPath(new URL('./battle-sim-trajectory.mjs', import.meta.url));
  try {
    const roots = ['a', 'b'].map((name) => path.join(dir, name));
    for (const root of roots) {
      fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
      fs.copyFileSync(script, path.join(root, 'scripts/battle-sim-trajectory.mjs'));
      fs.writeFileSync(path.join(root, '.gitignore'), '.variant\n');
      fs.writeFileSync(
        path.join(root, 'scripts/battle-sim-benchmark.mjs'),
        `
        import fs from 'node:fs';
        if (!process.argv.includes('--verify-only')) throw Error('Must use untimed mode');
        const variant = fs.existsSync('.variant');
        console.log(JSON.stringify({mode:'trajectory-validation',schema:1,steps:400,dt:0.05,
          scenario:'th18',pid:process.pid,hashes:Array.from({length:401},(_,i)=>(variant&&i===1?'b':'a').repeat(64))}));
      `,
      );
      const git = (...args) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
      git('init');
      git('add', '.');
      git(
        '-c',
        'user.name=Trace Test',
        '-c',
        'user.email=test@example.invalid',
        'commit',
        '-m',
        'fixture',
      );
    }
    const args = [
      script,
      `--baseline=${roots[0]}`,
      `--candidate=${roots[1]}`,
      `--output=${output}`,
    ];
    assert.equal(spawnSync(process.execPath, args).status, 0);
    let report = JSON.parse(fs.readFileSync(output));
    assert.equal(report.status, 'matched');
    assert.notEqual(report.trajectories[0].pid, report.trajectories[1].pid);
    fs.writeFileSync(path.join(roots[1], '.variant'), 'synthetic divergence');
    assert.equal(spawnSync(process.execPath, args).status, 1);
    report = JSON.parse(fs.readFileSync(output));
    assert.equal(report.status, 'mismatched');
    assert.equal(report.comparison.firstMismatchStep, 1);
    assert.equal(report.comparison.finalStateMatches, true);
    fs.writeFileSync(path.join(roots[1], 'dirty'), 'x');
    const dirty = spawnSync(process.execPath, args, { encoding: 'utf8' });
    assert.equal(dirty.status, 1);
    assert.match(dirty.stderr, /Commit work/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
