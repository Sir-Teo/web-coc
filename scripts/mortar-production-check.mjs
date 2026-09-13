import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

// This verifies shipping asset delivery; the live browser suite checks presentation.
const native = JSON.parse(await fs.readFile('reference/mortar/native.json', 'utf8'));
await fs.mkdir('output/playtest', { recursive: true });
const assets = [
  ...Object.values(native.world.textures),
  ...Object.values(native.previews),
  ...Object.values(native.sounds),
].map((value) => '/' + value.path);
const live = true;
let fixture;
const historical = [];
if (live) {
  const modules = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { mortarBattle, mortarVillage } = await modules.ssrLoadModule(
      '/tests/fixtures/mortar-battle.ts',
    );
    const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
    const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
    const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
    const village = mortarVillage(18);
    expect(validateSave(village)).toBe(true);
    const m = mortarBattle(18);
    for (let i = 0; i < 15; i++) m.step(0.05);
    const active = JSON.parse(
      JSON.stringify({
        mortars: m.battle.mortars,
        shells: m.battle.shells,
        troops: m.battle.units
          .filter((u) => u.hp > 0)
          .map((u) => [u.kind, u.x, u.y, Math.round(u.hp)]),
      }),
    );
    for (let i = 0; i < 4000 && !m.battle.finished; i++) m.step(0.05);
    expect(m.battle.finished).toBe(true);
    fixture = {
      village,
      active,
      result: m.battle.result,
      file: makeReplayFile(m.state.raidLog[0].replay),
    };
    for (const level of [1, 6, 10]) {
      const file = JSON.parse(
        await fs.readFile(`tests/fixtures/mortar-v34-level-${level}.crown-replay.json`, 'utf8'),
      );
      const viewer = new GameModel();
      expect(viewer.openReplay(file.replay)).toBe(true);
      viewer.seekReplay(0.75);
      while (viewer.replay.seeking) viewer.step(0.05);
      const b = viewer.battle;
      const active = JSON.parse(
        JSON.stringify({
          mortars: b.mortars,
          shells: b.shells,
          troops: b.units.filter((u) => u.hp > 0).map((u) => [u.kind, u.x, u.y, Math.round(u.hp)]),
        }),
      );
      viewer.seekReplay(9999);
      while (viewer.replay.seeking) viewer.step(0.05);
      historical.push({ level, file, active, result: viewer.battle.result });
    }
    await fs.writeFile(
      'output/playtest/mortar-production-fixture.json',
      JSON.stringify(fixture, null, 2),
    );
  } finally {
    await modules.close();
  }
}
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
      expect(online).toHaveLength(28);
      expect(online.filter((v) => v.seconds !== undefined)).toHaveLength(5);
      for (const value of online) {
        if (value.seconds !== undefined) expect(value.seconds).toBeGreaterThan(0.1);
        else {
          expect(value.width).toBeGreaterThan(0);
          expect(value.height).toBeGreaterThan(0);
        }
      }
      expect(online.find((v) => v.path.endsWith('/level-18.png'))).toMatchObject({
        width: 346,
        height: 336,
      });
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const replayCheck = async (label, record = fixture) => {
        const home = await read();
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles({
          name: 'mortar-level-18.crown-replay.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(record.file)),
        });
        await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
        const seek = async (at) => {
          if (!(await read()).replay.paused)
            await page.locator('[data-action="replay-pause"]').click();
          await page.evaluate((time) => {
            const slider = document.querySelector('#replay-progress');
            slider.value = String(time);
            slider.dispatchEvent(new Event('input', { bubbles: true }));
            slider.dispatchEvent(new Event('change', { bubbles: true }));
          }, at);
          await expect.poll(async () => (await read()).replay.seeking).toBe(false);
          await expect.poll(async () => (await read()).replay.time).toBeCloseTo(at, 6);
          return (await read()).battle;
        };
        const active = await seek(0.75);
        expect(active.mortars).toEqual(record.active.mortars);
        expect(active.shells).toEqual(record.active.shells);
        expect(active.legacyMortarFlight).toBe(record.file.replay.version === 34);
        expect(active.troops.map((u) => [u.kind, u.x, u.y, u.hp])).toEqual(record.active.troops);
        await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
        await page.screenshot({
          path: `output/playtest/mortar-production-${name}-${label}.png`,
          animations: 'disabled',
        });
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(record.result);
        const download = page.waitForEvent('download');
        await page.locator('[data-action="replay-export"]').click();
        const path = `output/playtest/mortar-production-${name}-${label}.crown-replay.json`;
        await (await download).saveAs(path);
        expect(JSON.parse(await fs.readFile(path, 'utf8'))).toEqual(record.file);
        expect((await seek(0)).mortars).toEqual({});
        expect(await seek(0.75)).toEqual(active);
        await page.locator('[data-action="replay-exit"]').click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        expect((await read()).army).toEqual(home.army);
        expect((await read()).resources).toEqual(home.resources);
      };
      if (live) {
        await page.locator('#import-file').setInputFiles({
          name: 'mortar-level-18-village.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(fixture.village)),
        });
        await expect(page.locator('#toast')).toContainText('Village restored');
        await replayCheck('online');
        for (const record of historical) await replayCheck(`v34-level-${record.level}`, record);
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
        if (live) await replayCheck('offline');
        offline = true;
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        online,
        offline,
        scope: live ? 'live-practice-and-portable-replay' : 'source-asset-delivery',
        ...(live
          ? {
              active: fixture.active,
              result: fixture.result,
              portableReplay: true,
              historical: historical.map((r) => ({
                level: r.level,
                version: r.file.replay.version,
                result: r.result,
              })),
            }
          : {}),
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    `output/playtest/native-mortar-${live ? 'production' : 'assets'}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
