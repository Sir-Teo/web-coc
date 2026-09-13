import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

await fs.mkdir('output/playtest', { recursive: true });
const native = JSON.parse(await fs.readFile('reference/wizard-tower/native.json', 'utf8'));
const requiredAssets = [
  ...Object.values(native.body.textures),
  ...Object.values(native.defender.textures),
  ...Object.values(native.effectArt.textures),
  ...Object.values(native.previews),
  ...Object.values(native.sounds),
].map((value) => '/' + value.path);
// Unchanged export from bf2f169, before native presentation was integrated.
const historicalBytes = await fs.readFile('tests/fixtures/wizard-tower-v34.crown-replay.json');
const historicalSha256 = createHash('sha256').update(historicalBytes).digest('hex');
expect(historicalSha256).toBe('582c00d4091e3ababcdda5f87c67d9766ce03f915470178d5d73d1e046ab31e8');
const historicalReplay = JSON.parse(historicalBytes);
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
const fixtures = [];
let villageFile;
try {
  const { wizardTowerBattle, wizardTowerVillage } = await modules.ssrLoadModule(
    '/tests/fixtures/wizard-tower-battle.ts',
  );
  const { seekingMineBattle, seekingMineVillage } = await modules.ssrLoadModule(
    '/tests/fixtures/seeking-mine-battle.ts',
  );
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
  const village = seekingMineVillage();
  village.nativeCampaign.stars[56] = 1;
  expect(validateSave(village)).toBe(true);
  villageFile = JSON.stringify(village);
  for (const level of [1, 5, 8, 10, 17, null]) {
    if (level !== null) expect(validateSave(wizardTowerVillage(level))).toBe(true);
    const m = level === null ? seekingMineBattle(57, village) : wizardTowerBattle(level);
    let flightAt, flight;
    for (let i = 0; i < 6000 && !m.battle.finished; i++) {
      m.step(0.05);
      if (
        flightAt === undefined &&
        m.battle.projectiles.some((p) => p.weapon === 'arcane') &&
        m.battle.elapsed >= 0.25
      ) {
        flightAt = m.battle.elapsed;
        // The shipping inspection endpoint is JSON; omit undefined optional keys
        // at this serialization boundary while retaining every numeric value.
        flight = JSON.parse(JSON.stringify(m.battle.projectiles));
      }
    }
    if (!m.battle.finished || flightAt === undefined)
      throw Error('Wizard Tower fixture did not fire and finish');
    fixtures.push({
      label: level === null ? 'graduation' : `level-${level}`,
      level,
      flightAt,
      flight,
      result: structuredClone(m.battle.result),
      file: makeReplayFile(m.state.raidLog[0].replay),
    });
  }
} finally {
  await modules.close();
}
const currentLevelTen = fixtures.find((fixture) => fixture.level === 10);
// This fixture has no Mortar: only the newly recorded rules version changes.
expect({
  ...currentLevelTen.file,
  replay: { ...currentLevelTen.file.replay, version: 34 },
}).toEqual(historicalReplay);
fixtures.push({ ...currentLevelTen, label: 'historical-v34', file: historicalReplay });

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
        loaded = new Set();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
        if (r.ok()) loaded.add(new URL(r.url()).pathname);
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(requiredAssets).toHaveLength(31);
      expect(requiredAssets.filter((path) => !loaded.has(path))).toEqual([]);
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      await page.locator('#import-file').setInputFiles({
        name: 'wizard-tower-village.json',
        mimeType: 'application/json',
        buffer: Buffer.from(villageFile),
      });
      await expect(page.locator('#toast')).toContainText('Village restored');
      await page.locator('.attack-btn').click();
      await expect(page.locator('[data-stage="58"]')).toContainText('Graduation Ceremony');
      await expect(page.locator('[data-action="attack:57"]')).toBeEnabled();
      await expect(page.locator('[data-action="attack:55"]')).toHaveText('Coming soon');
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
          name: 'wizard-tower-replay.json',
          mimeType: 'application/json',
          buffer:
            fixture.label === 'historical-v34'
              ? historicalBytes
              : Buffer.from(JSON.stringify(fixture.file)),
        });
        expect((await seek(0)).battle.projectiles).toEqual([]);
        const flight = await seek(fixture.flightAt);
        expect(flight.battle.projectiles).toEqual(fixture.flight);
        await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
        await page.screenshot({
          path: `output/playtest/wizard-tower-production-${fixture.label}-${name}.png`,
          animations: 'disabled',
        });
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(fixture.result);
        const download = page.waitForEvent('download');
        await page.locator('[data-action="replay-export"]').click();
        const path = `output/playtest/wizard-tower-production-${fixture.label}-${name}.crown-replay.json`;
        await (await download).saveAs(path);
        const exported = JSON.parse(await fs.readFile(path, 'utf8'));
        expect(exported).toEqual(fixture.file);
        expect(exported.replay.version).toBe(fixture.file.replay.version);
        expect((await seek(0)).battle.projectiles).toEqual([]);
        expect((await seek(fixture.flightAt)).battle).toEqual(flight.battle);
        await page.locator('[data-action="replay-exit"]').click();
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
        const after = await read();
        expect(after.army).toEqual(home.army);
        expect(after.resources).toEqual(home.resources);
        stages.push({
          label: fixture.label,
          level: fixture.level,
          originalEntities: fixture.file.replay.initial.buildings.length,
          towerCount: fixture.file.replay.initial.buildings.filter((b) => b.kind === 'wizardtower')
            .length,
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
            `output/playtest/wizard-tower-production-${fixture.label}-${name}.crown-replay.json`,
          );
          expect((await seek(fixture.flightAt)).battle.projectiles).toEqual(fixture.flight);
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
        stages,
        portableReplay: true,
        originalAssetsLoaded: requiredAssets,
        historicalReplay: { commit: 'bf2f169', sha256: historicalSha256, level: 10 },
        flightRewind: true,
        offline,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    'output/playtest/wizard-tower-production-report.json',
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
