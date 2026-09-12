import { chromium, webkit, expect } from '@playwright/test';
import { preview } from 'vite';
import fs from 'node:fs/promises';

// This verifies shipping asset delivery; the live browser suite checks presentation.
const native = JSON.parse(await fs.readFile('reference/wizard-tower/native.json', 'utf8'));
await fs.mkdir('output/playtest', { recursive: true });
const assets = [
  ...Object.values(native.body.textures),
  ...Object.values(native.defender.textures),
  ...Object.values(native.effectArt.textures),
  ...Object.values(native.previews),
  ...Object.values(native.sounds),
].map((value) => '/' + value.path);
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
        page.evaluate(async (paths) => {
          const audio = new AudioContext();
          try {
            return await Promise.all(
              paths.map(async (path) => {
                const response = await fetch(path);
                if (!response.ok) throw Error(`Missing source asset: ${path}`);
                const bytes = await response.arrayBuffer();
                const byteLength = bytes.byteLength;
                if (path.endsWith('.ogg')) {
                  const buffer = await audio.decodeAudioData(bytes);
                  return {
                    path,
                    bytes: byteLength,
                    seconds: buffer.duration,
                    channels: buffer.numberOfChannels,
                  };
                }
                const image = new Image();
                image.src = path;
                await image.decode();
                return {
                  path,
                  bytes: bytes.byteLength,
                  width: image.naturalWidth,
                  height: image.naturalHeight,
                };
              }),
            );
          } finally {
            await audio.close();
          }
        }, assets);
      const online = await decode();
      expect(online).toHaveLength(31);
      expect(online.filter((v) => v.seconds !== undefined)).toHaveLength(7);
      for (const value of online) {
        if (value.seconds !== undefined) expect(value.seconds).toBeGreaterThan(0.1);
        else {
          expect(value.width).toBeGreaterThan(0);
          expect(value.height).toBeGreaterThan(0);
        }
      }
      expect(online.find((v) => v.path.endsWith('/preview-17.png'))).toMatchObject({
        width: 360,
        height: 380,
      });
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
      report[name] = { errors, dpr: 2, online, offline, scope: 'source-asset-delivery' };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/native-wizard-tower-assets-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
