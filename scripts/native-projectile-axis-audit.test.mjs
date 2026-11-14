import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { auditOracle, replayAxisFixture } from './native-projectile-axis-audit.mjs';
const oracle = JSON.parse(fs.readFileSync(new URL('../reference/native-projectile-step-18.400.22.json', import.meta.url)));

test('all 18 retained fixture records agree with the axis interpretation', () => {
  const result = auditOracle(oracle);
  assert.equal(result.caseCount, 18);
  assert.equal(result.consistentCases, 18);
  assert.equal(result.allConsistent, true);
  assert.equal(result.newNativeExecution, false);
  assert.equal(result.productionBehaviorChanged, false);
});
test('contact at one step precedes counter consumption and post-step age', () => {
  const trace = replayAxisFixture({ speed_source: 1500, distance_sublogic: 976, initial_stop_counter: 32 });
  assert.deepEqual(trace.contact, { age_native_units: 0, stop_counter: 32 });
  assert.deepEqual(trace.first_steps, [{ tick: 0, position_sublogic: 0, age: 16, stop_counter: 32 }]);
  assert.equal(trace.held_steps, 0);
});
test('one sublogic unit beyond reach consumes two holds before advancing', () => {
  const trace = replayAxisFixture({ speed_source: 1500, distance_sublogic: 977, initial_stop_counter: 32 });
  assert.equal(trace.native_speed, 7680);
  assert.equal(trace.step_logic, 122);
  assert.equal(trace.hold_seconds, 0.032);
  assert.deepEqual(trace.first_steps.map(s => s.position_sublogic), [0, 0, 976, 976]);
  assert.deepEqual(trace.first_steps.map(s => s.stop_counter), [16, 0, 0, 0]);
  assert.equal(trace.contact.age_native_units, 48);
  assert.equal(trace.first_steps.at(-1).age, 64);
});
test('wrong event-age interpretation is detected rather than normalized away', () => {
  const changed = structuredClone(oracle);
  changed.cases[0].contact.age_native_units += 16;
  const result = auditOracle(changed);
  assert.equal(result.allConsistent, false);
  assert.equal(result.consistentCases, 17);
  assert.deepEqual(result.cases[0].mismatches, ['contact']);
});
test('invalid inputs, duplicate fixtures and altered scales fail closed', () => {
  assert.throws(() => replayAxisFixture({ speed_source: 0, distance_sublogic: 10, initial_stop_counter: 0 }));
  assert.throws(() => replayAxisFixture({ speed_source: 1500, distance_sublogic: -1, initial_stop_counter: 0 }));
  assert.throws(() => replayAxisFixture({ speed_source: 1500, distance_sublogic: 1, initial_stop_counter: 0.5 }));
  assert.throws(() => auditOracle({ ...oracle, step_seconds: 0.02 }));
  assert.throws(() => auditOracle({ ...oracle, cases: [...oracle.cases, oracle.cases[0]] }));
});

test('CLI fingerprints its actual inputs and writes a scoped diagnostic report', async () => {
  const { execFileSync } = await import('node:child_process');
  const { createHash } = await import('node:crypto');
  const { default: os } = await import('node:os');
  const { default: path } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axis-audit-'));
  try {
    const output = path.join(dir, 'report.json');
    const script = fileURLToPath(new URL('./native-projectile-axis-audit.mjs', import.meta.url));
    execFileSync(process.execPath, [script, `--output=${output}`]);
    const result = JSON.parse(fs.readFileSync(output));
    assert.equal(result.allConsistent, true);
    assert.equal(result.oracleFileSha256, createHash('sha256').update(fs.readFileSync(
      new URL('../reference/native-projectile-step-18.400.22.json', import.meta.url))).digest('hex'));
    assert.equal(result.diagnosticScriptSha256, createHash('sha256').update(fs.readFileSync(script)).digest('hex'));
    assert.notEqual(result.oracleFileSha256, result.recordedRecoveredImageSha256);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
