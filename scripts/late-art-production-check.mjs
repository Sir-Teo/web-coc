import { preview } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

await fs.access('dist/sw.js');
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
