/** CPU-only crowd separation workload; --baseline=REF loads that revision's model
 * without editing the working tree. Compare state hashes as well as run medians. */
import { createServer } from 'vite';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const baseline = process.argv.find((arg) => arg.startsWith('--baseline='))?.slice(11);
const source = baseline
  ? execFileSync('git', ['show', `${baseline}:src/game/model.ts`], { encoding: 'utf8' })
  : null;
const server = await createServer({
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: source
    ? [
        {
          name: 'crowd-benchmark-baseline',
          enforce: 'pre',
          load(id) {
            if (id.endsWith('/src/game/model.ts')) return source;
          },
        },
      ]
    : [],
});
try {
  const { separateUnits } = await server.ssrLoadModule('/src/game/model.ts');
  const { separationCrowd } = await server.ssrLoadModule('/tests/fixtures/crowd-separation.ts');
  const results = [];
  for (const [name, spread, mixed, cap] of [
    ['dense', 0.01, false, 0.1],
    ['mixed layers', 0.01, true, 0.1],
    ['spread out', 0.4, false, 0.1],
    ['historical uncapped', 0.01, false, undefined],
  ]) {
    const times = [],
      hashes = [];
    for (let run = 0; run < 7; run++) {
      const units = separationCrowd(512, spread, mixed);
      const start = performance.now();
      for (let tick = 0; tick < 40; tick++) {
        // Repeat the same initial overlap to measure the deployment burst, rather
        // than allowing the scene to disperse and measuring an empty workload.
        for (let i = 0; i < units.length; i++) {
          units[i].x = 20 + (i % 8) * spread;
          units[i].y = 20 + Math.floor(i / 8) * spread;
        }
        separateUnits(units, [], true, cap);
      }
      if (run >= 2) times.push(performance.now() - start);
      hashes.push(createHash('sha256').update(JSON.stringify(units)).digest('hex'));
    }
    if (hashes.some((hash) => hash !== hashes[0])) throw Error('Non-deterministic separation');
    results.push({
      name,
      medianMs: times.toSorted((a, b) => a - b)[2],
      runs: times,
      hash: hashes[0],
    });
  }
  console.log(
    JSON.stringify({ implementation: baseline ?? 'working tree', warmup: 2, results }, null, 2),
  );
} finally {
  await server.close();
}
