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

test.describe('phone cold boot', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a stalled X-Bow graph does not block the first village interaction', async ({
    page,
  }, info) => {
    const graph = ART_GRAPH_CASES.find(({ kind }) => kind === 'xbow')!;
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', save),
      artGraphSave(graph.kind),
    );
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pattern = '**/' + graph.module + '*';
    await page.route(pattern, async (route) => {
      await held;
      await route.continue();
    });
    try {
      const requested = page.waitForRequest(
        (request) => new URL(request.url()).pathname === '/' + graph.module,
      );
      await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
      await requested;
      await expect(page.locator('#loading')).toBeHidden({ timeout: 18000 });
      await page.locator('[data-action="settings"]').tap();
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => {
          const { scene } = window.__game;
          return scene.sprites.get(3)?.alpha;
        }),
      ).toBe(1);
      await page.screenshot({ path: info.outputPath('settings-while-graph-stalled.png') });
    } finally {
      release();
    }

    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            const bow = model.buildings.find((building) => building.id === 3);
            return { ready: scene.familyArtReady(bow), alpha: scene.sprites.get(3)?.alpha };
          }),
        { timeout: 20000 },
      )
      .toEqual({ ready: true, alpha: 0 });
  });
});
