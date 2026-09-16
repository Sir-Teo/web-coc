// Scratch measurement (not committed): cold boot of two production builds in Chromium.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
const targets = [
  ['main', process.argv[2]],
  ['branch', process.argv[3]],
];
const runs = Number(process.argv[4] ?? 5);
const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-precise-memory-info'] });
const results = {};
for (const [name, root] of targets) {
  const server = await preview({ root, configFile: false, build: { outDir: 'dist' }, preview: { host: '127.0.0.1', port: 0, strictPort: true }, logLevel: 'error' });
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  const samples = [];
  for (let i = 0; i < runs + 1; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    let requests = 0, bytes = 0;
    page.on('response', async (r) => { requests++; const h = r.headers()['content-length']; if (h) bytes += Number(h); });
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForSelector('#loading', { state: 'attached', timeout: 60000 }).catch(() => {}); await page.locator('#loading').waitFor({ state: 'detached', timeout: 120000 });
    const ready = Date.now() - t0;
    await page.waitForTimeout(500);
    const heap = await page.evaluate(() => performance.memory?.usedJSHeapSize ?? 0);
    const client = await context.newCDPSession(page);
    const { usedSize } = await client.send('Runtime.getHeapUsage');
    if (i > 0) samples.push({ ready, requests, mb: +(bytes / 1048576).toFixed(1), heapMB: +(heap / 1048576).toFixed(0), cdpHeapMB: +(usedSize / 1048576).toFixed(0) });
    await context.close();
  }
  await server.httpServer.close();
  const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
  results[name] = { medianReadyMs: med('ready'), requests: med('requests'), transferMB: med('mb'), heapMB: med('heapMB'), samples };
}
console.log(JSON.stringify(results, null, 1));
await browser.close();
