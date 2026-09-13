import { chromium, webkit, expect } from '@playwright/test';
import { preview } from 'vite';
import fs from 'node:fs/promises';

const manifest = JSON.parse(await fs.readFile('reference/garrison/sounds.json', 'utf8'));
await fs.mkdir('output/playtest', { recursive: true });
const server = await preview({
  preview: { host: '127.0.0.1', port: 0, strictPort: true },
  logLevel: 'warn',
});
const report = {};
try {
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
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}`);
      await expect(page.locator('.shop-btn')).toBeVisible();
      const decode = () =>
        page.evaluate(async (sounds) => {
          const audio = new AudioContext();
          try {
            return await Promise.all(
              sounds.map(async (sound) => {
                const response = await fetch('/' + sound.path);
                if (!response.ok) throw Error(`Missing sample ${sound.path}`);
                const data = await response.arrayBuffer();
                const sha256 = Array.from(
                  new Uint8Array(await crypto.subtle.digest('SHA-256', data)),
                  (v) => v.toString(16).padStart(2, '0'),
                ).join('');
                const buffer = await audio.decodeAudioData(data.slice(0));
                return {
                  path: sound.path,
                  sha256,
                  bytes: data.byteLength,
                  duration: buffer.duration,
                  channels: buffer.numberOfChannels,
                };
              }),
            );
          } finally {
            await audio.close();
          }
        }, Object.values(manifest.sounds));
      const online = await decode();
      expect(online).toHaveLength(7);
      for (const [i, expected] of Object.values(manifest.sounds).entries()) {
        expect(online[i]).toMatchObject(expected);
        expect(online[i].duration).toBeGreaterThan(0);
      }
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
      report[name] = { online, offline, errors };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/garrison-sounds-production.json',
    JSON.stringify(report, null, 2),
  );
  console.log(
    'Seven original garrison samples verified in both engines; Chromium offline reload matches.',
  );
} finally {
  await server.close();
}
