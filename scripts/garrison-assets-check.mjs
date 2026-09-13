import { chromium, webkit, expect } from '@playwright/test';
import { preview } from 'vite';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Source-asset delivery, separate from live garrison combat integration.
const native = JSON.parse(await fs.readFile('reference/garrison/art.json', 'utf8'));
const assets = [
  ...Object.values(native.worlds).flatMap((w) => Object.values(w.textures)),
  ...Object.values(native.previews),
  ...Object.values(native.icons),
];
const expected = new Map(
  await Promise.all(
    assets.map(async (asset) => [
      '/' + asset.path,
      {
        width: asset.width,
        height: asset.height,
        sha256: createHash('sha256')
          .update(await fs.readFile(`public/${asset.path}`))
          .digest('hex'),
      },
    ]),
  ),
);
await fs.mkdir('output/playtest', { recursive: true });
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
const report = {};
try {
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const [name, engine] of [
    ['chromium', chromium],
    ['webkit', webkit],
  ]) {
    const browser = await engine.launch({
      headless: true,
      ...(name === 'chromium' && process.platform === 'darwin'
        ? { args: ['--use-angle=metal'] }
        : {}),
    });
    try {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage(),
        errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (response) => {
        if (response.status() >= 400) errors.push(response.url());
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      const decode = () =>
        page.evaluate(
          async (paths) =>
            Promise.all(
              paths.map(async (path) => {
                const response = await fetch(path);
                if (!response.ok) throw Error(`Missing source asset: ${path}`);
                const bytes = await response.arrayBuffer();
                const sha256 = Array.from(
                  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
                  (v) => v.toString(16).padStart(2, '0'),
                ).join('');
                const image = new Image();
                image.src = path;
                await image.decode();
                return {
                  path,
                  bytes: bytes.byteLength,
                  sha256,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                };
              }),
            ),
          [...expected.keys()],
        );
      const online = await decode();
      expect(online).toHaveLength(44);
      for (const asset of online) expect(asset).toMatchObject(expected.get(asset.path));
      let offline = false;
      if (name === 'chromium') {
        await page.evaluate(async () => {
          await navigator.serviceWorker.ready;
          if (!navigator.serviceWorker.controller)
            await new Promise((resolve) =>
              navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }),
            );
        });
        await context.setOffline(true);
        await page.reload();
        await expect(page.locator('.shop-btn')).toBeVisible();
        expect(await decode()).toEqual(online);
        offline = true;
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        online,
        offline,
        scope: 'source-asset-delivery; garrison combat is not integrated',
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/native-garrison-assets-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
