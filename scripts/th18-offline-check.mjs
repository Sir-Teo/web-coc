import { chromium } from '@playwright/test';
import { preview } from 'vite';
import fs from 'node:fs/promises';
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'error',
});
const browser = await chromium.launch();
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(base);
  await page.evaluate(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, {}, { timeout: 120000 });
  const assets = [
    '/assets/catalog-native/town-hall/level-18.png',
    '/assets/village-native/townhall/graph.json',
    '/assets/troops-native/ruinwitch/graph.json',
  ];
  const read = async () =>
    page.evaluate(
      async (paths) =>
        Promise.all(
          paths.map(async (path) => {
            const r = await fetch(path);
            if (!r.ok) throw Error(`${path}: ${r.status}`);
            const bytes = await r.arrayBuffer();
            const hash = await crypto.subtle.digest('SHA-256', bytes);
            return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
          }),
        ),
      assets,
    );
  const online = await read();
  await context.setOffline(true);
  const offline = await read();
  if (JSON.stringify(online) !== JSON.stringify(offline)) throw Error('Offline asset bytes differ');
  const report = { assets, hashes: online, offline: true };
  await fs.writeFile('output/th18/offline.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await new Promise((resolve) => server.httpServer.close(resolve));
}
