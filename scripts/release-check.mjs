import { preview } from 'vite';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';

// Own an isolated preview port so the release check cannot accidentally test an
// older development/preview process already running on the workstation.
await fs.access('dist/index.html');
await fs.access('dist/sw.js');
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
try {
  const address = server.httpServer.address();
  if (!address || typeof address === 'string') throw new Error('Preview did not bind a TCP port.');
  const baseURL = `http://127.0.0.1:${address.port}`;
  console.log(`Testing the production build at ${baseURL}`);
  const child = spawn(process.execPath, ['scripts/production-check.mjs'], {
    stdio: 'inherit',
    env: { ...process.env, PRODUCTION_BASE_URL: baseURL },
  });
  const timeout = setTimeout(() => child.kill('SIGTERM'), 180_000);
  try {
    await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (code === 0) resolve();
        else reject(new Error(`Production checks failed (${signal ?? `exit ${code}`}).`));
      });
    });
  } finally {
    clearTimeout(timeout);
  }
} finally {
  await server.close();
}
