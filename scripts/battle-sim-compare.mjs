/** Fresh-process comparison of variant-local battle-sim-benchmark.mjs harnesses. */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

export function summarize(pairs) {
  if (pairs.length < 2) throw Error('At least two independent process pairs required');
  const logs = pairs.map(({ a, b }) => {
    if (!(a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)))
      throw Error('Metrics must be finite and positive');
    return Math.log(b / a);
  });
  const mean = logs.reduce((a, b) => a + b, 0) / logs.length;
  const se = Math.sqrt(logs.reduce((n, x) => n + (x - mean) ** 2, 0) /
    (logs.length - 1) / logs.length);
  // Descriptive standard error, NOT a confidence interval or significance test.
  return { processPairs: logs.length, geometricRatioBOverA: Math.exp(mean),
    logRatioStandardError: se, percentReduction: 100 * (1 - Math.exp(mean)) };
}

export function validateReport(report) {
  const runs = Array.isArray(report.runs) ? report.runs : [report];
  if (!runs.length || runs.some(r => r.profiled || !Number.isFinite(r.totalMs) || r.totalMs <= 0 ||
      typeof r.hash !== 'string' || !/^[a-f0-9]{64}$/.test(r.hash)))
    throw Error('Invalid, empty or profiled timing report');
  if (runs.some(r => r.hash !== runs[0].hash || r.activeSteps !== runs[0].activeSteps))
    throw Error('Within-process deterministic result mismatch');
  return { totalMs: runs.reduce((n, r) => n + r.totalMs, 0) / runs.length,
    hash: runs[0].hash, activeSteps: runs[0].activeSteps };
}

function identity(root) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  const harness = path.join(root, 'scripts/battle-sim-benchmark.mjs');
  const status = git('status', '--porcelain');
  if (status) throw Error(`Commit work before benchmarking: ${root}`);
  return { root, commit: git('rev-parse', 'HEAD'), status,
    harnessSha256: createHash('sha256').update(fs.readFileSync(harness)).digest('hex') };
}

async function main() {
  const opts = Object.fromEntries(process.argv.slice(2).map(arg => {
    const match = /^--([^=]+)=(.+)$/.exec(arg);
    if (!match) throw Error('Arguments must be --name=value');
    return [match[1], match[2]];
  }));
  if (Object.keys(opts).some(k => !['baseline', 'candidate', 'pairs', 'warmup', 'runs', 'army', 'output'].includes(k)))
    throw Error('Unknown option');
  if (!opts.baseline || !opts.candidate) throw Error('Supply --baseline=PATH --candidate=PATH');
  const pairs = Number(opts.pairs ?? 6), warmup = Number(opts.warmup ?? 3), runs = Number(opts.runs ?? 3);
  if (!Number.isInteger(pairs) || pairs < 2 || pairs % 2 ||
      !Number.isInteger(warmup) || warmup < 0 || !Number.isInteger(runs) || runs < 1)
    throw Error('Use even --pairs >= 2, integer --warmup >= 0 and --runs >= 1');
  const army = opts.army ?? 'th18';
  if (!['th18', 'roster'].includes(army)) throw Error('Invalid army');
  const roots = { a: fs.realpathSync(opts.baseline), b: fs.realpathSync(opts.candidate) };
  const identities = { a: identity(roots.a), b: identity(roots.b) };
  if (identities.a.harnessSha256 !== identities.b.harnessSha256)
    throw Error('Harness differs: reconcile measurement code before comparing');
  const output = path.resolve(opts.output ?? 'output/playtest/battle-sim-comparison.json');
  const report = { protocol: 1, startedAt: new Date().toISOString(), node: process.version,
    platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model,
    settings: { pairs, warmup, runs, army }, identities, observations: [], summaries: {},
    caveat: 'Descriptive CPU simulation measurements, not browser FPS, native parity, or proof of causality. A/A is a diagnostic, not a pass/fail correction.' };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const save = () => fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  save();
  for (const phase of ['aa-before', 'ab', 'aa-after']) {
    const measured = [];
    for (let pair = 0; pair < pairs; pair++) {
      const order = pair % 2 ? ['b', 'a'] : ['a', 'b'];
      const values = {};
      for (const label of order) {
        const variant = phase === 'ab' ? label : 'a';
        const root = roots[variant];
        const stdout = execFileSync(process.execPath, ['scripts/battle-sim-benchmark.mjs',
          `--army=${army}`, `--warmup=${warmup}`, `--runs=${runs}`],
        { cwd: root, encoding: 'utf8', timeout: 600000, maxBuffer: 8 * 1024 * 1024 });
        const raw = JSON.parse(stdout);
        const value = validateReport(raw);
        if (report.observations.length && value.hash !== report.observations[0].value.hash)
          throw Error('Cross-process/variant battle hash mismatch; comparison invalid');
        values[label] = value.totalMs;
        report.observations.push({ phase, pair, label, variant, value, raw });
        save();
      }
      measured.push(values);
    }
    report.summaries[phase] = summarize(measured);
    save();
  }
  if (JSON.stringify(identities) !== JSON.stringify({ a: identity(roots.a), b: identity(roots.b) }))
    throw Error('Checkout changed during measurements; report incomplete');
  report.completedAt = new Date().toISOString();
  save();
  console.log(JSON.stringify(report.summaries, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
