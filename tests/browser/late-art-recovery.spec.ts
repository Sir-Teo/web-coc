import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function scoutLateVillage(page: Page) {
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.buildings = [
      makeBuilding(1000, 'townhall', 20, 20, 14),
      makeBuilding(1001, 'eagleartillery', 15, 15, 1),
      makeBuilding(1002, 'scattershot', 25, 15, 1),
    ];
    model.state.nextId = 1003;
    model.startBattle(0, true);
    // The home village does not need the late bundle after this scout visit.
    model.state.buildings = model.state.buildings.filter(
      (building) => building.kind === 'townhall',
    );
    model.changed();
    scene.sync();
  });
}

for (const online of [false, true]) {
  test(`late building art recovers ${online ? 'on reconnect' : 'after a temporary failure'} with its fallback visible`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const graph = JSON.parse(await readFile('reference/eagle-artillery/runtime.json', 'utf8'));
    const paths = new Set(Object.values(graph.textures).map((texture) => '/' + texture.path));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    let attempts = 0;
    page.on('request', (request) => {
      if (paths.has(new URL(request.url()).pathname)) attempts++;
    });
    for (const path of paths)
      await page.route('**' + path, (route) =>
        route.fulfill({ status: 503, body: 'Temporary outage' }),
      );
    await scoutLateVillage(page);
    await page.waitForFunction(() => window.__game.scene.lateAssetsReady);
    await expect.poll(() => attempts).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const fallback = window.__game.scene.sprites.get(1001);
          return (
            !!fallback?.visible &&
            fallback.alpha > 0 &&
            !['__DEFAULT', '__MISSING'].includes(fallback.texture.key)
          );
        }),
      )
      .toBe(true);
    // A different family in the same failed batch still draws natively.
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (object) =>
              object.visible && object.alpha > 0 && object.getData?.('scattershot')?.id === 1002,
          ),
        ),
      )
      .toBe(true);
    const firstBatch = await page.evaluate(() => [...window.__game.scene.lateTextureKeys]);
    await page.waitForTimeout(1200);
    const initial = attempts;
    await page.screenshot({ path: `output/playtest/late-art-${online}-fallback.png` });
    for (const path of paths) await page.unroute('**' + path);
    if (online) {
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(initial);
    }
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { scene, model } = window.__game;
            const eagle = model.battle!.buildings.find((building) => building.id === 1001)!;
            return (
              scene.lateCampaign.handles(eagle) &&
              scene.children.list.some(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  object.getData?.('eagleArtillery')?.id === 1001,
              )
            );
          }),
        { timeout: 20000 },
      )
      .toBe(true);
    expect(
      await page.evaluate(() => ({
        fallbackAlpha: window.__game.scene.sprites.get(1001)?.alpha,
        elapsed: window.__game.model.battle!.elapsed,
        started: window.__game.model.battle!.started,
      })),
    ).toEqual({ fallbackAlpha: 0, elapsed: 0, started: false });
    await page.screenshot({ path: `output/playtest/late-art-${online}-recovered.png` });
    const leftover = await page.evaluate((firstBatch) => {
      const { model, scene } = window.__game;
      const owned = new Set([...firstBatch, ...scene.lateTextureKeys]);
      model.returnHome();
      scene.sync();
      scene.lateIdleSince = undefined;
      scene.releaseLateAssetsWhenIdle(0);
      scene.releaseLateAssetsWhenIdle(Number.MAX_SAFE_INTEGER);
      return {
        ready: scene.lateAssetsReady,
        textures: [...owned].filter((key) => scene.textures.exists(key)),
      };
    }, firstBatch);
    expect(leftover).toEqual({ ready: false, textures: [] });
    expect(errors).toEqual([]);
  });
}

for (const moduleName of ['late-campaign-scene', 'character-graphs'])
  test(`a failed ${moduleName} module retries on reconnect while scouting is held`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const modulePath = `/src/game/${moduleName}.ts`;
    const pattern = '**' + modulePath + '*';
    let attempts = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === modulePath) attempts++;
    });
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporary module outage' }),
    );
    await scoutLateVillage(page);
    await page.waitForFunction(
      () => !!window.__game.scene.lateArtFailure && !window.__game.scene.lateArtLoading,
    );
    expect(
      await page.evaluate(() => ({
        ready: window.__game.scene.lateAssetsReady,
        prep: window.__game.model.battle!.prep,
        elapsed: window.__game.model.battle!.elapsed,
      })),
    ).toEqual({ ready: false, prep: 30, elapsed: 0 });
    expect(attempts).toBe(1);
    await page.unroute(pattern);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(1);
    await page.waitForFunction(() => window.__game.scene.lateAssetsReady, undefined, {
      timeout: 30000,
    });
    expect(await page.evaluate(() => window.__game.scene.lateArtFailure)).toBeUndefined();
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (object) =>
              object.visible && object.alpha > 0 && object.getData?.('eagleArtillery')?.id === 1001,
          ),
        ),
      )
      .toBe(true);
    expect(errors).toEqual([]);
  });
