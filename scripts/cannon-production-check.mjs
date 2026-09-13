import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

// This verifies shipping asset delivery; the live browser suite checks presentation.
const native = JSON.parse(await fs.readFile('reference/cannon/native.json', 'utf8'));
await fs.mkdir('output/playtest', { recursive: true });
const assets = [
  ...Object.values(native.world.textures),
  ...Object.values(native.previews),
  ...Object.values(native.icons),
  ...Object.values(native.sounds),
].map((value) => '/' + value.path);
const live = true;
let fixture, campaign;
const historical = [];
if (live) {
  const modules = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const { cannonBattle, cannonVillage } = await modules.ssrLoadModule(
      '/tests/fixtures/cannon-battle.ts',
    );
    const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
    const { GameModel } = await modules.ssrLoadModule('/src/game/model.ts');
    const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
    const village = cannonVillage(21);
    expect(validateSave(village)).toBe(true);
    const m = cannonBattle(21);
    for (let i = 0; i < 6; i++) m.step(0.05);
    const active = JSON.parse(
      JSON.stringify({
        cannons: m.battle.cannons,
        projectiles: m.battle.projectiles,
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
    for (const [version, level] of [
      [35, 1],
      [35, 8],
      [35, 12],
      [34, 8],
    ]) {
      const file = JSON.parse(
        await fs.readFile(
          `tests/fixtures/cannon-v${version}-level-${level}.crown-replay.json`,
          'utf8',
        ),
      );
      const viewer = new GameModel();
      expect(viewer.openReplay(file.replay)).toBe(true);
      viewer.seekReplay(0.3);
      while (viewer.replay.seeking) viewer.step(0.05);
      const b = viewer.battle;
      const active = JSON.parse(
        JSON.stringify({
          cannons: b.cannons,
          projectiles: b.projectiles,
          troops: b.units.filter((u) => u.hp > 0).map((u) => [u.kind, u.x, u.y, Math.round(u.hp)]),
        }),
      );
      viewer.seekReplay(9999);
      while (viewer.replay.seeking) viewer.step(0.05);
      historical.push({ level, file, active, result: viewer.battle.result });
    }
    const { highPressureBattle } = await modules.ssrLoadModule(
      '/tests/fixtures/high-pressure-battle.ts',
    );
    const raid = highPressureBattle();
    for (let i = 0; i < 6; i++) raid.step(0.05);
    const b = raid.battle;
    const campaignActive = JSON.parse(
      JSON.stringify({
        cannons: b.cannons ?? {},
        projectiles: b.projectiles ?? [],
        troops: b.units.filter((u) => u.hp > 0).map((u) => [u.kind, u.x, u.y, Math.round(u.hp)]),
      }),
    );
    for (let i = 0; i < 6000 && !raid.battle.finished; i++) raid.step(0.05);
    expect(raid.battle.finished).toBe(true);
    campaign = {
      active: campaignActive,
      result: raid.battle.result,
      file: makeReplayFile(raid.state.raidLog[0].replay),
    };
    await fs.writeFile(
      'output/playtest/cannon-production-high-pressure.json',
      JSON.stringify(campaign, null, 2),
    );
    await fs.writeFile(
      'output/playtest/cannon-production-fixture.json',
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
      expect(online).toHaveLength(53);
      expect(online.filter((v) => v.seconds !== undefined)).toHaveLength(5);
      for (const value of online) {
        if (value.seconds !== undefined) expect(value.seconds).toBeGreaterThan(0.1);
        else {
          expect(value.width).toBeGreaterThan(0);
          expect(value.height).toBeGreaterThan(0);
        }
      }
      expect(online.find((v) => v.path.endsWith('/level-21.png'))).toMatchObject({
        width: 410,
        height: 346,
      });
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const replayCheck = async (label, record = fixture) => {
        const home = await read();
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles({
          name: 'cannon-level-21.crown-replay.json',
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
        const active = await seek(0.3);
        expect(active.cannons).toEqual(record.active.cannons);
        expect(active.projectiles).toEqual(record.active.projectiles);
        expect(active.legacyCannonFlight).toBe(record.file.replay.version < 36);
        expect(active.troops.map((u) => [u.kind, u.x, u.y, u.hp])).toEqual(record.active.troops);
        await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
        await page.screenshot({
          path: `output/playtest/cannon-production-${name}-${label}.png`,
          animations: 'disabled',
        });
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(record.result);
        const download = page.waitForEvent('download');
        await page.locator('[data-action="replay-export"]').click();
        const path = `output/playtest/cannon-production-${name}-${label}.crown-replay.json`;
        await (await download).saveAs(path);
        expect(JSON.parse(await fs.readFile(path, 'utf8'))).toEqual(record.file);
        expect((await seek(0)).cannons).toEqual({});
        expect(await seek(0.3)).toEqual(active);
        await page.locator('[data-action="replay-exit"]').click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        expect((await read()).army).toEqual(home.army);
        expect((await read()).resources).toEqual(home.resources);
      };
      if (live) {
        await page.locator('#import-file').setInputFiles({
          name: 'cannon-level-21-village.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(fixture.village)),
        });
        await expect(page.locator('#toast')).toContainText('Village restored');
        await replayCheck('online');
        await replayCheck('high-pressure', campaign);
        for (const record of historical)
          await replayCheck(`v${record.file.replay.version}-level-${record.level}`, record);
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
              highPressure: { version: campaign.file.replay.version, result: campaign.result },
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
    `output/playtest/native-cannon-${live ? 'production' : 'assets'}-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
