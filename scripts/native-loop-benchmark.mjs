/** First-use render-cache loop metadata on shipped native graphs (no WebGL or FPS claim).
 * node scripts/native-loop-benchmark.mjs [--runs=7]
 * Fresh graph identities force metadata derivation; JSON I/O and parsing stay outside timing.
 */
import { createServer } from 'vite';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const runs = Number(process.argv.find((arg) => arg.startsWith('--runs='))?.split('=')[1] ?? 7);
if (!Number.isInteger(runs) || runs < 1) throw Error('Use a positive integer --runs.');
const files = (await fs.readdir('public/assets', { recursive: true }))
  .filter((path) => path.endsWith('/graph.json'))
  .sort();
const graphs = (
  await Promise.all(
    files.map(async (file) => JSON.parse(await fs.readFile(`public/assets/${file}`, 'utf8'))),
  )
)
  .flatMap((pack) => (pack.scenes ? Object.values(pack.scenes) : [pack]))
  .filter((graph) => graph.exports && graph.clips && graph.shapes);
const server = await createServer({
  cacheDir: 'node_modules/.vite-native-loop',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { nativeSharedFrame } = await server.ssrLoadModule('/src/game/native-loop-period.ts');
  const timings = [];
  let digest,
    exports = 0;
  for (let run = -2; run < runs; run++) {
    const inputs = graphs.map((graph) => ({ ...graph }));
    const results = [];
    const start = performance.now();
    for (const graph of inputs)
      for (const id of Object.values(graph.exports)) {
        results.push(nativeSharedFrame(graph, id, 100000));
      }
    const elapsed = performance.now() - start;
    const hash = createHash('sha256').update(JSON.stringify(results)).digest('hex');
    if (digest && digest !== hash) throw Error('Nondeterministic loop metadata');
    digest = hash;
    exports = results.length;
    if (run >= 0) timings.push(elapsed);
  }
  const sorted = [...timings].sort((a, b) => a - b);
  console.log(
    JSON.stringify(
      {
        graphs: graphs.length,
        exports,
        runs,
        milliseconds: timings,
        medianMs: sorted[Math.floor(sorted.length / 2)],
        digest,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
