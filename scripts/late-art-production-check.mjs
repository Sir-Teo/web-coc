import { preview } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { previousArtRelease } from './previous-art-release.mjs';

await fs.access('dist/sw.js');
const previous = await previousArtRelease();
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
  plugins: [
    {
      name: 'late-art-unavailable-host',
      configurePreviewServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!/(?:^|;\s*)late-art-offline=yes(?:;|$)/.test(request.headers.cookie ?? ''))
            return next();
          response.writeHead(503, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
          response.end('Preview host unavailable for offline verification.');
          return;
        });
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url, 'http://preview.local');
          const old = /(?:^|;\s*)late-art-release=previous(?:;|$)/.test(
            request.headers.cookie ?? '',
          );
          if (old && previous.bodies.has(url.pathname)) {
            response.writeHead(200, {
              'content-type': url.pathname.endsWith('.json')
                ? 'application/json'
                : 'text/javascript',
              'cache-control': 'no-store',
            });
            response.end(previous.bodies.get(url.pathname));
            return;
          }
          if (!old && url.pathname === previous.graphPath) {
            response.writeHead(404, { 'cache-control': 'no-store' });
            response.end('Graph removed by the next release.');
            return;
          }
          next();
        });
      },
    },
  ],
});
try {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw Error('Preview did not bind a TCP port.');
  const child = spawn(
    process.execPath,
    [
      'node_modules/@playwright/test/cli.js',
      'test',
      '--config=playwright.late-art.config.ts',
      ...process.argv.slice(2),
    ],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        LATE_ART_BUILD: '1',
        PRODUCTION_BASE_URL: `http://127.0.0.1:${address.port}`,
        PREVIOUS_ART_VERSION: previous.version,
        CURRENT_ART_VERSION: previous.current,
        PREVIOUS_ART_GRAPH: previous.graphPath,
      },
    },
  );
  const timer = setTimeout(() => child.kill('SIGTERM'), 300000);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) =>
        code === 0 ? resolve() : reject(Error(`Late art checks failed (${signal ?? code}).`)),
      );
    });
  } finally {
    clearTimeout(timer);
  }
} finally {
  await server.close();
}
