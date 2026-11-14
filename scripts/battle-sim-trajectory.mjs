/** Untimed full-battle snapshots after every simulation step. Not a performance test. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function recordTrajectory(model, steps = 400, dt = 0.05) {
  if (!Number.isInteger(steps) || steps < 1 || steps > 100000 || !(dt > 0 && Number.isFinite(dt)))
    throw Error('Invalid trajectory step settings');
  const hash = () => createHash('sha256').update(JSON.stringify(model.battle)).digest('hex');
  const hashes = [hash()];
  for (let step = 0; step < steps; step++) {
    model.step(dt);
    hashes.push(hash());
  }
  return { mode: 'trajectory-validation', schema: 1, steps, dt, hashes };
}

export function compareTrajectories(a, b) {
  for (const report of [a, b]) {
    if (
      report?.mode !== 'trajectory-validation' ||
      report.schema !== 1 ||
      !Number.isInteger(report.steps) ||
      report.steps < 1 ||
      !(report.dt > 0 && Number.isFinite(report.dt)) ||
      !Array.isArray(report.hashes) ||
      report.hashes.length !== report.steps + 1 ||
      report.hashes.some((hash) => typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash))
    )
      throw Error('Invalid trajectory report');
  }
  if (a.steps !== b.steps || a.dt !== b.dt || a.scenario !== b.scenario)
    throw Error('Trajectory settings or scenarios differ');
  const firstMismatchStep = a.hashes.findIndex((hash, step) => hash !== b.hashes[step]);
  return {
    matches: firstMismatchStep === -1,
    checkpoints: a.hashes.length,
    firstMismatchStep: firstMismatchStep === -1 ? null : firstMismatchStep,
    finalStateMatches: a.hashes.at(-1) === b.hashes.at(-1),
  };
}

function identity(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  if (git('status', '--porcelain')) throw Error(`Commit work before validation: ${root}`);
  const files = ['scripts/battle-sim-benchmark.mjs', 'scripts/battle-sim-trajectory.mjs'];
  return {
    root,
    commit: git('rev-parse', 'HEAD'),
    harnesses: Object.fromEntries(
      files.map((file) => [
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.join(root, file)))
          .digest('hex'),
      ]),
    ),
  };
}

async function main() {
  const options = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--(baseline|candidate|army|output)=(.+)$/.exec(arg);
    if (!match || Object.hasOwn(options, match[1])) throw Error('Use unique --name=value options');
    options[match[1]] = match[2];
  }
  if (!options.baseline || !options.candidate) throw Error('Supply --baseline and --candidate');
  const army = options.army ?? 'th18';
  if (!['th18', 'roster'].includes(army)) throw Error('Invalid army');
  const roots = [options.baseline, options.candidate].map((root) => fs.realpathSync(root));
  const identities = roots.map(identity);
  if (JSON.stringify(identities[0].harnesses) !== JSON.stringify(identities[1].harnesses))
    throw Error('Reconcile trajectory harness files before comparing');
  const output = path.resolve(options.output ?? 'output/playtest/battle-sim-trajectory.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const report = {
    protocol: 1,
    status: 'running',
    startedAt: new Date().toISOString(),
    node: process.version,
    army,
    identities,
    trajectories: [],
    caveat:
      'Untimed per-step JSON battle snapshots; no performance, rendered-frame or native Android parity claim. Detects differences at 50ms step boundaries, not within a step or outside serialized battle state.',
  };
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  save();
  try {
    for (const root of roots) {
      const stdout = execFileSync(
        process.execPath,
        ['scripts/battle-sim-benchmark.mjs', '--verify-only', `--army=${army}`],
        { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 * 1024 },
      );
      const trajectory = JSON.parse(stdout);
      if (trajectory.scenario !== army || trajectory.steps !== 400 || trajectory.dt !== 0.05)
        throw Error('Child trajectory does not match requested workload');
      report.trajectories.push(trajectory);
      save();
    }
    if (JSON.stringify(identities) !== JSON.stringify(roots.map(identity)))
      throw Error('Checkout changed during validation');
    report.comparison = compareTrajectories(...report.trajectories);
    report.status = report.comparison.matches ? 'matched' : 'mismatched';
    report.completedAt = new Date().toISOString();
    save();
    if (!report.comparison.matches)
      throw Error(`Trajectory differs at step ${report.comparison.firstMismatchStep}`);
    console.log(JSON.stringify(report.comparison, null, 2));
  } catch (error) {
    if (report.status === 'running') report.status = 'failed';
    report.error = error.message;
    save();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
