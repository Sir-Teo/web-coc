import { expect, test } from '@playwright/test';
import { developedSave } from '../fixtures/developed-village';
import { initialSave } from '../../src/game/model';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

for (const village of ['starter', 'developed'] as const) {
  test(`a stalled Archer Tower page leaves the ${village} village playable and recovers`, async ({
    page,
    request,
  }, info) => {
    const save = village === 'starter' ? initialSave() : developedSave();
    save.tutorial = true;
    await page.addInitScript((save) => {
      if (!localStorage.getItem('crown-clan-save-v1'))
        localStorage.setItem('crown-clan-save-v1', save);
    }, JSON.stringify(save));
    const tower = save.buildings.find((building) => building.kind === 'archertower')!;
    // The dev server serves level-paged art. Resolve the body page from its transformed graph.
    const graph = await request.get('/reference/archer-tower/buildings-runtime.json?import');
    const source = await graph.text();
    const textures = JSON.parse(/^export const textures = (.+);$/m.exec(source)![1]) as Record<
      string,
      { path: string; levels?: number[] }
    >;
    const texture = Object.values(textures).find((entry) => entry.levels?.includes(tower.level));
    expect(texture).toBeDefined();
    const path = '/' + texture!.path;
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**${path}`, async (route) => {
      await held;
      await route.continue().catch((error) => {
        if (!String(error).includes('Invalid InterceptionId')) throw error;
      });
    });
    const settings = page.locator('[data-action="settings"]');
    try {
      const requested = page.waitForRequest((request) => new URL(request.url()).pathname === path);
      await page.goto('/?lazyart', { waitUntil: 'domcontentloaded' });
      await requested;
      await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
      await settings.tap();
      await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
      expect(
        await page.evaluate((id) => window.__game.scene.sprites.get(id)?.alpha, tower.id),
      ).toBe(1);
      await page.screenshot({ path: info.outputPath(`${village}-settings-on-fallback.png`) });
    } finally {
      release();
    }
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            const { scene } = window.__game;
            return {
              alpha: scene.sprites.get(id)?.alpha,
              ready: scene.villageArcherTowers.views.has(id),
            };
          }, tower.id),
        { timeout: 20000 },
      )
      .toEqual({ alpha: 0, ready: true });
    await page.unroute(`**${path}`);
    await page.getByRole('button', { name: 'Close dialog' }).tap();

    // A fresh navigation follows the ordinary warm path, then starts a first raid by touch.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
    await settings.tap();
    await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close dialog' }).tap();
    await page.locator('.attack-btn').tap();
    await page.locator('[data-action="attack:0"]').tap();
    await expect(page.locator('.prep-banner')).toBeVisible();
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    const card = page.locator('[data-action="troop:swordsman"]');
    await card.tap();
    const spot = await page.evaluate(() => {
      const { model, scene, game } = window.__game;
      for (let x = 1.5; x < 44; x++)
        for (let y = 1.5; y < 44; y++) {
          if (model.deployBlocked(x, y)) continue;
          const p = scene.screenFor(x, y);
          if (
            p.y > innerHeight * 0.3 &&
            p.y < innerHeight * 0.6 &&
            document.elementFromPoint(p.x, p.y) === game.canvas
          )
            return p;
        }
      throw Error('No visible deployment point');
    });
    const before = await card.locator('.troop-count').textContent();
    await page.touchscreen.tap(spot.x, spot.y);
    await expect(card.locator('.troop-count')).toHaveText(`x${Number(before?.slice(1)) - 1}`);
  });
}
