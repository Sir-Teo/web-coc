import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

await fs.mkdir('output/playtest', { recursive: true });
const native = JSON.parse(await fs.readFile('reference/seeking-mine/native.json', 'utf8'));
const runtimeAssets = [
  ...Object.values(native.world.textures),
  ...Object.values(native.previews),
  native.info,
  ...Object.values(native.sounds),
]
  .map((asset) => '/' + asset.path)
  .sort();
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const fixtures = [];
let villageFile;
try {
  const { seekingMineBattle, seekingMineVillage } = await modules.ssrLoadModule(
    '/tests/fixtures/seeking-mine-battle.ts',
  );
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const { NATIVE_CAMPAIGN } = await modules.ssrLoadModule('/src/game/native-campaign.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const village = seekingMineVillage();
  if (!validateSave(village)) throw Error('Invalid mine fixture village');
  villageFile = JSON.stringify(village);
  for (const index of [51, 52, 53]) {
    const m = seekingMineBattle(index);
    let flightAt, flight;
    const mines = m.battle.buildings.filter((b) => b.kind === 'seekingairmine');
    for (let i = 0; i < 6000 && !m.battle.finished; i++) {
      m.step(0.05);
      if (
        flightAt === undefined &&
        mines.some((mine) => {
          const state = m.battle.traps[mine.id];
          return (
            state &&
            !state.resolved &&
            Math.hypot(state.x - mine.x - 0.5, state.y - mine.y - 0.5) > 0.1
          );
        })
      ) {
        flightAt = m.battle.elapsed;
        flight = mines
          .filter((mine) => m.battle.traps[mine.id])
          .map((mine) => ({
            sourceId: mine.id,
            level: mine.level,
            ...structuredClone(m.battle.traps[mine.id]),
          }));
      }
    }
    if (!m.battle.finished || flightAt === undefined)
      throw Error('Mine fixture did not fly and settle');
    fixtures.push({
      index,
      name: NATIVE_CAMPAIGN[index].name,
      flightAt,
      flight,
      result: structuredClone(m.battle.result),
      file: makeReplayFile(m.state.raidLog[0].replay),
    });
  }
} finally {
  await modules.close();
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
        errors = [],
        requestedMineAssets = new Set();
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname;
        if (path.startsWith('/assets/buildings/seeking-mine-native/'))
          requestedMineAssets.add(path);
      });
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      expect([...requestedMineAssets].sort()).toEqual(runtimeAssets);
      await page.locator('#import-file').setInputFiles({
        name: 'mine-village.json',
        mimeType: 'application/json',
        buffer: Buffer.from(villageFile),
      });
      await expect(page.locator('#toast')).toContainText('Village restored');
      await page.locator('.attack-btn').click();
      for (const fixture of fixtures) {
        await expect(page.locator(`[data-stage="${fixture.index + 1}"]`)).toContainText(
          fixture.name,
        );
        await expect(page.locator(`[data-action="attack:${fixture.index}"]`)).toBeEnabled();
      }
      await expect(page.locator('[data-action="attack:56"]')).toHaveText('Coming soon');
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const seek = async (time) => {
        if (!(await read()).replay.paused)
          await page.locator('[data-action="replay-pause"]').click();
        await expect(page.getByRole('slider', { name: 'Replay position' })).toBeEnabled();
        await page.evaluate((value) => {
          const slider = document.querySelector('#replay-progress');
          if (!slider || slider.disabled) throw Error('Replay position unavailable');
          slider.value = String(value);
          slider.dispatchEvent(new Event('input', { bubbles: true }));
          slider.dispatchEvent(new Event('change', { bubbles: true }));
        }, time);
        await expect.poll(async () => (await read()).replay.seeking).toBe(false);
        await expect.poll(async () => (await read()).replay.time).toBeCloseTo(time, 6);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        return read();
      };
      const open = async (file) => {
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles(file);
        await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      };
      const home = await read();
      const stages = [];
      for (const fixture of fixtures) {
        await open({
          name: 'mine-replay.json',
          mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify(fixture.file)),
        });
        await expect(page.locator('.battle-enemy h2')).toHaveText(fixture.name);
        expect((await seek(0)).battle.seekingMines).toEqual([]);
        const flight = await seek(fixture.flightAt);
        expect(flight.battle.seekingMines).toEqual(fixture.flight);
        await page.screenshot({
          path: `output/playtest/seeking-mine-production-${fixture.index}-${name}.png`,
          animations: 'disabled',
        });
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(fixture.result);
        const download = page.waitForEvent('download');
        await page.locator('[data-action="replay-export"]').click();
        const path = `output/playtest/seeking-mine-production-${fixture.index}-${name}.crown-replay.json`;
        await (await download).saveAs(path);
        const exported = JSON.parse(await fs.readFile(path, 'utf8'));
        expect(exported).toEqual(fixture.file);
        expect(exported.replay.version).toBe(36);
        expect((await seek(0)).battle.seekingMines).toEqual([]);
        expect((await seek(fixture.flightAt)).battle).toEqual(flight.battle);
        await page.locator('[data-action="replay-exit"]').click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        const after = await read();
        expect(after.army).toEqual(home.army);
        expect(after.resources).toEqual(home.resources);
        stages.push({
          index: fixture.index,
          name: fixture.name,
          originalEntities: fixture.file.replay.initial.buildings.length,
          mineCount: fixture.file.replay.initial.buildings.filter(
            (b) => b.kind === 'seekingairmine',
          ).length,
          flightAt: fixture.flightAt,
          flight: fixture.flight,
          result: fixture.result,
        });
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
        for (const fixture of fixtures) {
          await open(
            `output/playtest/seeking-mine-production-${fixture.index}-${name}.crown-replay.json`,
          );
          expect((await seek(fixture.flightAt)).battle.seekingMines).toEqual(fixture.flight);
          await page.getByRole('slider', { name: 'Replay position' }).press('End');
          await expect(page.locator('.replay-status')).toContainText('Replay complete');
          expect((await read()).battle.result).toEqual(fixture.result);
          await page.locator('[data-action="replay-exit"]').click();
          await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        }
        offline = true;
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        viewport: [390, 844],
        requestedMineAssets: [...requestedMineAssets].sort(),
        stages,
        portableReplay: true,
        flightRewind: true,
        offline,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/seeking-mine-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
