/**
 * Fail on tests that import something the source no longer exports.
 *
 * `tsconfig.json` covers `src` only, so a rename or a module split can leave a test importing
 * a symbol that no longer exists. Nothing catches that until the suite runs, which is minutes
 * of work to learn one line is wrong. This typechecks the tests too, but reports only the
 * module-resolution codes, because the test tree still carries unrelated type errors that
 * predate this check and would otherwise keep the gate permanently red.
 */
import { spawnSync } from 'node:child_process';

/** Cannot find module; has no exported member; has no exported member (did you mean…). */
const RESOLUTION = new Set(['TS2305', 'TS2307', 'TS2724']);
const LINE = /^(?<file>[^(]+)\((?<line>\d+),\d+\): error (?<code>TS\d+): (?<message>.*)$/;

const { stdout } = spawnSync('npx', ['tsc', '--noEmit', '-p', 'tsconfig.tests.json'], {
  encoding: 'utf8',
});
const found = stdout
  .split('\n')
  .map((line) => LINE.exec(line)?.groups)
  .filter((hit) => hit && RESOLUTION.has(hit.code));

for (const hit of found) console.error(`${hit.file}:${hit.line}  ${hit.message}`);
if (found.length) {
  console.error(`\n${found.length} test import(s) name something the source does not export.`);
  process.exit(1);
}
console.log('Every test imports only symbols the source exports.');
