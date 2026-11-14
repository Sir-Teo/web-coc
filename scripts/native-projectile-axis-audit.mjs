/** Diagnostic interpretation of retained synthetic axis fixtures; no runtime integration. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';

export function replayAxisFixture({ speed_source, distance_sublogic, initial_stop_counter }) {
  if (![speed_source, distance_sublogic, initial_stop_counter].every(Number.isSafeInteger) ||
      speed_source <= 0 || distance_sublogic < 0 || initial_stop_counter < 0 ||
      !Number.isSafeInteger(speed_source * 512))
    throw Error('Diagnostic requires nonnegative safe integer axis inputs and positive speed');
  const native_speed = Math.trunc(speed_source * 512 / 100);
  if (!Number.isSafeInteger(native_speed * 16)) throw Error('Unsafe native speed conversion');
  const step_logic = Math.trunc(native_speed * 16 / 1000), step = step_logic * 8;
  if (step <= 0 || !Number.isSafeInteger(step)) throw Error('Unsupported zero/unsafe movement step');
  let position = 0, age = 0, stop = initial_stop_counter, held_steps = 0;
  const first_steps = [];
  for (let tick = 0; tick < 10000; tick++) {
    // Contact is observed at entry age; the fixture also records the post-update
    // age afterward. The terminal callback does not advance recorded position.
    const contact = distance_sublogic - position <= step
      ? { age_native_units: age, stop_counter: stop } : undefined;
    if (!contact) {
      if (stop > 0) { stop = Math.max(0, stop - 16); held_steps++; }
      else position += step;
    }
    age += 16;
    if (first_steps.length < 4)
      first_steps.push({ tick, position_sublogic: position, age, stop_counter: stop });
    if (contact) return { native_speed, step_logic, held_steps,
      hold_seconds: held_steps * 0.016, contact, first_steps };
  }
  throw Error('Diagnostic resource bound exceeded; no truncated trace accepted');
}

export function auditOracle(oracle) {
  if (oracle.step_seconds !== 0.016 || oracle.coordinate_scale?.logic_per_tile !== 512 ||
      oracle.coordinate_scale?.projectile_sublogic_per_tile !== 4096 ||
      !Array.isArray(oracle.cases) || !oracle.cases.length)
    throw Error('Unsupported oracle schema/scales');
  const seen = new Set();
  const cases = oracle.cases.map(recorded => {
    const key = `${recorded.speed_source}:${recorded.distance_sublogic}:${recorded.initial_stop_counter}`;
    if (seen.has(key)) throw Error(`Duplicate fixture ${key}`);
    seen.add(key);
    const replayed = replayAxisFixture(recorded);
    const mismatches = Object.keys(replayed).filter(k => !isDeepStrictEqual(replayed[k], recorded[k]));
    return { key, mismatches, replayed };
  });
  return { diagnostic: 'retained-axis-fixture-interpretation',
    newNativeExecution: false, productionBehaviorChanged: false,
    scope: 'Positive-axis synthetic fixtures only; no live objects, off-axis collision, or continuous-port equivalence.',
    recordedRecoveredImageSha256: oracle.source_sha256,
    recordedOriginalApkSha256: oracle.original_apk_sha256,
    caseCount: cases.length, consistentCases: cases.filter(c => !c.mismatches.length).length,
    allConsistent: cases.every(c => !c.mismatches.length), cases };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.some(a => !a.startsWith('--output=')) || args.length > 1)
      throw Error('Usage: node scripts/native-projectile-axis-audit.mjs [--output=PATH]');
    const root = fileURLToPath(new URL('..', import.meta.url));
    const input = fs.readFileSync(path.join(root, 'reference/native-projectile-step-18.400.22.json'));
    const report = { diagnosticScriptSha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
      oracleFileSha256: createHash('sha256').update(input).digest('hex'),
      ...auditOracle(JSON.parse(input.toString('utf8'))) };
    const output = args.length ? args[0].slice('--output='.length)
      : path.join(root, 'output/analysis/native-projectile-axis-audit.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ ...report, cases: undefined, output }, null, 2));
    if (!report.allConsistent) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
