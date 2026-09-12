import { chromium, webkit, expect } from '@playwright/test';
import { createServer, preview } from 'vite';
import fs from 'node:fs/promises';

const invaders = process.argv.includes('--invaders');
const label = invaders ? 'invaders' : 'bomb-tower';
await fs.mkdir('output/playtest', { recursive: true });
const native = JSON.parse(await fs.readFile('reference/bombtower/native.json', 'utf8'));
const nativeAssets = [
  ...Object.values(native.body.textures),
  ...Object.values(native.defender.textures),
  ...Object.values(native.particleArt.textures),
  ...Object.values(native.previews),
  ...Object.values(native.sounds),
].map((value) => '/' + value.path);
const modules = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
let file, expected, firingAt, fuseAt, explosionAt, villageFile, sourceId, level, hp;
try {
  const { GameModel, makeBuilding } = await modules.ssrLoadModule('/src/game/model.ts');
  const { makeReplayFile } = await modules.ssrLoadModule('/src/game/replay-file.ts');
  const { emptyArmy } = await modules.ssrLoadModule('/src/game/army.ts');
  let m;
  if (invaders) {
    const { invadersBattle, invadersVillage } = await modules.ssrLoadModule(
      '/tests/fixtures/invaders-battle.ts',
    );
    const { validateSave } = await modules.ssrLoadModule('/src/game/save.ts');
    const village = invadersVillage();
    if (!validateSave(village)) throw Error('Invalid Invaders village fixture');
    villageFile = JSON.stringify(village);
    m = invadersBattle();
  } else {
    m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 30, 30, 8),
      makeBuilding(3, 'bombtower', 6, 10, 2),
    ];
    m.state.nextId = 4;
    m.state.army = { ...emptyArmy(), dragon: 3, giant: 2 };
    m.startBattle(0, true);
    for (const kind of ['giant', 'dragon']) {
      m.activeTroop = kind;
      while (m.battle.remaining[kind])
        if (!m.deploy(1, 11)) throw Error('Bomb Tower fixture deployment failed');
    }
  }
  const tower = m.battle.buildings.find((b) => b.kind === 'bombtower');
  sourceId = tower.id;
  level = tower.level;
  hp = tower.maxHp;
  for (let i = 0; i < (invaders ? 1600 : 500) && !m.battle.finished; i++) {
    m.step(0.05);
    const shot = m.battle.bombTowers?.[sourceId]?.shots[0];
    if (shot && firingAt === undefined) firingAt = Math.round((shot.at + 0.1) * 20) / 20;
  }
  const bomb = m.battle.deathBombs?.[sourceId];
  if (!bomb?.resolved || firingAt === undefined)
    throw Error('Bomb Tower fixture did not fire and explode');
  fuseAt = Math.round((bomb.armedAt + 0.3) * 20) / 20;
  explosionAt = Math.round((bomb.impact + 0.15) * 20) / 20;
  if (invaders && !m.battle.finished) throw Error('Invaders did not finish');
  m.finishBattle();
  expected = structuredClone(m.battle.result);
  file = JSON.stringify(makeReplayFile(m.state.raidLog[0].replay));
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
        missingAssets = new Set(nativeAssets);
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('response', (r) => {
        if (r.status() >= 400) errors.push(r.url());
        if (r.ok()) missingAssets.delete(new URL(r.url()).pathname);
      });
      await page.goto(url);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.locator('#loading').waitFor({ state: 'detached' });
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
      expect([...missingAssets]).toEqual([]);
      const read = () => page.evaluate(() => JSON.parse(window.render_game_to_text()));
      const seek = async (time) => {
        if (!(await read()).replay.paused)
          await page.locator('[data-action="replay-pause"]').click();
        const slider = page.getByRole('slider', { name: 'Replay position' });
        await expect(slider).toBeEnabled();
        // Resolve the current form and dispatch in one browser turn: HUD renders
        // can replace a previously resolved range node between driver calls.
        await page.evaluate((value) => {
          const el = document.querySelector('#replay-progress');
          if (!el || el.disabled) throw Error('Replay range is unavailable');
          el.value = String(value);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }, time);
        await expect.poll(async () => (await read()).replay.seeking).toBe(false);
        await expect.poll(async () => (await read()).replay.time).toBeCloseTo(time, 6);
        // Seeking updates the model synchronously; let Phaser commit the new scene
        // before screenshots, which otherwise can capture the preceding fuse frame.
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        return read();
      };
      const open = async (input) => {
        await page.locator('[data-action="battle-log"]').click();
        await page.locator('#import-replay-file').setInputFiles(input);
        await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
      };
      if (invaders) {
        await page.locator('#import-file').setInputFiles({
          name: 'invaders-village.json',
          mimeType: 'application/json',
          buffer: Buffer.from(villageFile),
        });
        await expect(page.locator('#toast')).toContainText('Village restored');
        await page.locator('.attack-btn').click();
        await expect(page.locator('[data-stage="51"]')).toContainText('Invaders');
        await expect(page.locator('[data-action="attack:50"]')).toBeEnabled();
        await expect(page.locator('[data-action="attack:54"]')).toHaveText('Coming soon');
        await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      }
      await open({
        name: `${label}-fixture.crown-replay.json`,
        mimeType: 'application/json',
        buffer: Buffer.from(file),
      });
      const initial = await seek(0);
      expect(initial.buildings.find((b) => b.type === 'bombtower')).toMatchObject({
        id: sourceId,
        level,
        hp,
      });
      const firing = await seek(firingAt);
      expect(firing.battle.projectiles.some((p) => p.weapon === 'towerbomb')).toBe(true);
      const fused = await seek(fuseAt);
      expect(fused.battle.deathBombs).toHaveLength(1);
      expect(fused.battle.deathBombs[0].sourceId).toBe(sourceId);
      expect(fused.battle.deathBombs[0].damage).toBe(invaders ? 220 : 180);
      await page.screenshot({
        path: `output/playtest/${label}-production-${name}.png`,
        animations: 'disabled',
      });
      const exploded = await seek(explosionAt);
      expect(exploded.battle.deathBombs).toEqual([]);
      await page.screenshot({
        path: `output/playtest/${label}-production-explosion-${name}.png`,
        animations: 'disabled',
      });
      await page.getByRole('slider', { name: 'Replay position' }).press('End');
      await expect(page.locator('.replay-status')).toContainText('Replay complete');
      expect((await read()).battle.result).toEqual(expected);
      const download = page.waitForEvent('download');
      await page.locator('[data-action="replay-export"]').click();
      const path = `output/playtest/${label}-production-${name}.crown-replay.json`;
      await (await download).saveAs(path);
      const exported = JSON.parse(await fs.readFile(path, 'utf8'));
      expect(exported.replay.initial.buildings.find((b) => b.kind === 'bombtower')).toMatchObject({
        level,
        hp,
        maxHp: hp,
      });
      expect(exported.replay.initial.buildings).toEqual(JSON.parse(file).replay.initial.buildings);
      if (invaders) expect(exported.replay.initial.buildings).toHaveLength(272);
      const back = await seek(0);
      expect(back.buildings).toEqual(initial.buildings);
      expect((await seek(firingAt)).battle.projectiles).toEqual(firing.battle.projectiles);
      expect((await seek(fuseAt)).battle.deathBombs).toEqual(fused.battle.deathBombs);
      expect((await seek(explosionAt)).battle).toEqual(exploded.battle);
      let offline = false,
        offlineSounds = [];
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
        const images = await page.evaluate(async () =>
          Promise.all(
            Array.from({ length: 13 }, async (_, i) => {
              const im = new Image();
              im.src = `/assets/buildings/bombtower-native/preview-${i + 1}.png`;
              await im.decode();
              return [im.naturalWidth, im.naturalHeight];
            }),
          ),
        );
        expect(images).toEqual(Array.from({ length: 13 }, () => [360, 420]));
        offlineSounds = await page.evaluate(
          async (paths) => {
            const audio = new AudioContext();
            try {
              return await Promise.all(
                paths.map(async (path) => {
                  const response = await fetch('/' + path);
                  if (!response.ok) throw Error(`Offline sound unavailable: ${path}`);
                  const buffer = await audio.decodeAudioData(await response.arrayBuffer());
                  return { path, seconds: buffer.duration };
                }),
              );
            } finally {
              await audio.close();
            }
          },
          Object.values(native.sounds).map((sound) => sound.path),
        );
        expect(offlineSounds).toHaveLength(6);
        for (const sound of offlineSounds) expect(sound.seconds).toBeGreaterThan(0.3);
        await open(path);
        expect((await seek(0)).buildings).toEqual(initial.buildings);
        expect((await seek(firingAt)).battle.projectiles).toEqual(firing.battle.projectiles);
        expect((await seek(fuseAt)).battle.deathBombs).toEqual(fused.battle.deathBombs);
        expect((await seek(explosionAt)).battle).toEqual(exploded.battle);
        await page.getByRole('slider', { name: 'Replay position' }).press('End');
        await expect(page.locator('.replay-status')).toContainText('Replay complete');
        expect((await read()).battle.result).toEqual(expected);
        offline = true;
      }
      expect(errors).toEqual([]);
      report[name] = {
        errors,
        dpr: 2,
        viewport: [390, 844],
        level,
        hp,
        ...(invaders
          ? { village: 'Invaders', originalEntities: 272, townHallRecommendation: 9 }
          : {}),
        portableReplay: true,
        firingAndFuseRewind: true,
        firingAt,
        fuseAt,
        explosionAt,
        explosionRewind: true,
        seekResult: expected,
        offline,
        offlineSounds,
        nativeAssetsLoaded: nativeAssets.length,
      };
    } finally {
      await browser.close();
    }
  }
  await fs.writeFile(
    `output/playtest/${label}-production-report.json`,
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await server.close();
}
