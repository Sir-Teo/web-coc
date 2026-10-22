import { test, expect } from '@playwright/test';
import { createServer } from 'vite';

let shared: Record<string, string>;
test.beforeAll(async () => {
  // Use the same transform as the browser instead of pinning the content-hashed page URLs.
  const server = await createServer({
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  });
  try {
    const graphs = await server.ssrLoadModule('/src/game/archer-tower-art.ts');
    shared = Object.fromEntries(
      [
        ['body', graphs.ARCHER_TOWER_GRAPH],
        ['resident', graphs.TOWER_ARCHER_GRAPH],
      ].map(([part, graph]) => {
        const page = Object.values(graph.textures).find((texture: any) => !texture.levels) as
          { path: string } | undefined;
        if (!page) throw Error(`No shared ${part} page`);
        return [part, '/' + page.path];
      }),
    );
  } finally {
    await server.close();
  }
});

for (const part of ['body', 'resident'])
  test(`a shared Archer Tower ${part} page recovers after failing during boot`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const path = shared[part];
    const pattern = '**' + path;
    let attempts = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === path) attempts++;
    });
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporary shared page outage' }),
    );
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const tower = model.buildings.find((building) => building.kind === 'archertower');
      if (!tower) throw Error('No starter Archer Tower');
      scene.sync();
      return tower.id;
    });
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const { model, scene } = window.__game;
          const tower = model.buildings.find((building) => building.id === id);
          return {
            native: scene.villageArcherTowers.drawsLevel(tower.level),
            alpha: scene.sprites.get(id)?.alpha,
          };
        }, id),
      )
      .toEqual({ native: false, alpha: 1 });
    await page.waitForTimeout(1000);
    const failed = attempts;
    await page.unroute(pattern);
    if (part === 'resident') {
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(failed);
    }
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { model, scene } = window.__game;
            const tower = model.buildings.find((building) => building.id === id);
            return {
              native: scene.villageArcherTowers.drawsLevel(tower.level),
              alpha: scene.sprites.get(id)?.alpha,
              visible: scene.children.list.some(
                (object) =>
                  object.visible &&
                  object.alpha > 0 &&
                  object.getData?.('nativeTowerArcher')?.id === id,
              ),
            };
          }, id),
        { timeout: 20000 },
      )
      .toEqual({ native: true, alpha: 0, visible: true });
    expect(attempts).toBeGreaterThan(failed);
    expect(errors).toEqual([]);
    await page.screenshot({ path: `output/playtest/shared-archer-${part}-recovered.png` });
  });
