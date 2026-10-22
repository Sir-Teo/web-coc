import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/** A previous release with one uncached lazy graph removed by the next deployment. */
export async function previousArtRelease(dist = 'dist') {
  const manifest = JSON.parse(await fs.readFile(path.join(dist, '.vite/manifest.json'), 'utf8'));
  const graph = manifest['reference/xbow/runtime.json'].file;
  const worker = await fs.readFile(path.join(dist, 'sw.js'), 'utf8');
  const current = JSON.parse(worker.match(/const VERSION = ("[^"]+");/)[1]);
  const version = current + '-previous-art';
  const graphPath = '/assets/xbow-previous-release.js';
  const manifestPath = `/sw-manifest.${version}.json`;
  const hashes = JSON.parse(
    await fs.readFile(path.join(dist, `sw-manifest.${current}.json`), 'utf8'),
  );
  const graphBytes = await fs.readFile(path.join(dist, graph));
  const bodies = new Map([[graphPath, graphBytes]]);
  const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  let patched = 0;
  for (const file of new Set(Object.values(manifest).map((entry) => entry.file))) {
    if (!file.endsWith('.js')) continue;
    const code = await fs.readFile(path.join(dist, file), 'utf8');
    if (!code.includes(path.posix.basename(graph))) continue;
    const previous = code.replaceAll(path.posix.basename(graph), path.posix.basename(graphPath));
    bodies.set('/' + file, previous);
    hashes['/' + file] = digest(previous);
    patched++;
  }
  if (!patched) throw Error('No lazy X-Bow graph import found for the previous-release fixture.');
  hashes[graphPath] = digest(graphBytes);
  bodies.set(manifestPath, JSON.stringify(hashes));
  bodies.set(
    '/sw.js',
    worker
      .replace(/const VERSION = "[^"]+";/, `const VERSION = ${JSON.stringify(version)};`)
      .replace(
        /const MANIFEST_URL = "[^"]+";/,
        `const MANIFEST_URL = ${JSON.stringify(manifestPath)};`,
      ),
  );
  return { current, version, graphPath, bodies };
}
