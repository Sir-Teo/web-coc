import { test, expect } from '@playwright/test';
import { ART_GRAPH_CASES, artGraphSave } from './art-graph-fixture';

for (const actor of ART_GRAPH_CASES)
  test(`a failed ${actor.name} graph retries on reconnect without navigating`, async ({ page }) => {
    const path = '/' + actor.module;
    const pattern = '**' + path + '*';
    const requests: string[] = [];
    const errors: string[] = [];
    let navigations = 0;
    page.on('request', (request) => {
      if (request.method() === 'GET' && new URL(request.url()).pathname === path)
        requests.push(request.url());
    });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations++;
    });
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', save),
      artGraphSave(actor.kind),
    );
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporary graph outage' }),
    );
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    const fallback = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const building = model.buildings.find((building) => building.id === 3);
      const sprite = scene.sprites.get(3);
      return {
        ready: scene.familyArtReady(building),
        alpha: sprite?.alpha,
        texture: sprite?.texture.key,
      };
    });
    expect(fallback.ready).toBe(false);
    expect(fallback.alpha).toBe(1);
    expect(['__MISSING', '__DEFAULT']).not.toContain(fallback.texture);
    expect(navigations).toBe(1);
    expect(requests.length).toBeGreaterThan(0);
    const failed = requests.length;
    await page.unroute(pattern);
    const recovered = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === path &&
        response.ok(),
    );
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect.poll(() => requests.length, { timeout: 2000 }).toBeGreaterThan(failed);
    const response = await recovered;
    expect(response.headers()['content-type']).toMatch(/javascript/);
    expect(Number(new URL(response.url()).searchParams.get('art-retry'))).toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            return {
              ready: scene.familyArtReady(model.buildings.find((building) => building.id === 3)),
              alpha: scene.sprites.get(3)?.alpha,
            };
          }),
        { timeout: 20000 },
      )
      .toEqual({ ready: true, alpha: 0 });
    expect(navigations).toBe(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `output/playtest/graph-${actor.kind}-recovered.png` });
  });
