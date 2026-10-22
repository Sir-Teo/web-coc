import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

for (const scenario of [
  { part: 'metadata', online: false, scouting: false },
  { part: 'metadata', online: true, scouting: false },
  { part: 'page', online: true, scouting: false },
  { part: 'metadata', online: false, scouting: true },
  { part: 'metadata', online: true, scouting: true },
  { part: 'page', online: true, scouting: true },
]) {
  test(`village ${scenario.part} recovers ${scenario.online ? 'when connectivity returns' : 'after a temporary failure'} ${scenario.scouting ? 'while scouting' : 'at home'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const catalogue = JSON.parse(await readFile('reference/full-client/village-art.json', 'utf8'));
    const metadata = '/' + catalogue.buildings.pethouse.path;
    let path = metadata;
    if (scenario.part === 'page') {
      const response = await page.request.get(metadata);
      expect(response.ok()).toBe(true);
      const pack = (await response.json()) as {
        scenes: Record<string, { textures: Record<string, { path: string; levels?: number[] }> }>;
      };
      const texture = Object.values(pack.scenes)
        .flatMap((scene) => Object.values(scene.textures))
        .find((row) => !row.levels || row.levels.includes(1));
      if (!texture) throw Error('No Pet House level 1 texture');
      path = '/' + texture.path;
    }
    const attempts: number[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === path) attempts.push(Date.now());
    });
    const pattern = '**' + path;
    await page.route(pattern, (route) =>
      route.fulfill({ status: 503, body: 'Temporarily unavailable' }),
    );
    const buildingId = await page.evaluate(async (scouting) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1000, 'townhall', 20, 20, 14),
        makeBuilding(1001, 'pethouse', 15, 15, 1),
      ];
      model.state.nextId = 1002;
      model.changed();
      if (scouting) model.startBattle(0, true);
      scene.sync();
      return 1001;
    }, scenario.scouting);
    await expect.poll(() => attempts.length).toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate((id) => {
          const sprite = window.__game.scene.sprites.get(id);
          return (
            !!sprite?.visible &&
            sprite.alpha > 0 &&
            !['__DEFAULT', '__MISSING'].includes(sprite.texture.key)
          );
        }, buildingId),
      )
      .toBe(true);
    await page.waitForTimeout(1200);
    for (let i = 1; !scenario.scouting && i < attempts.length; i++)
      expect(attempts[i] - attempts[i - 1]).toBeGreaterThanOrEqual(4500);
    await page.screenshot({
      path: `output/playtest/village-${scenario.part}-${scenario.online}-${scenario.scouting}-fallback.png`,
    });
    await page.unroute(pattern);
    if (scenario.online) {
      const before = attempts.length;
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
      await expect.poll(() => attempts.length, { timeout: 2000 }).toBeGreaterThan(before);
    }
    await expect
      .poll(
        () =>
          page.evaluate((id) => {
            return window.__game.scene.children.list.some(
              (object) =>
                object.visible && object.alpha > 0 && object.getData?.('nativeVillage') === id,
            );
          }, buildingId),
        { timeout: 15000 },
      )
      .toBe(true);
    expect(
      await page.evaluate((id) => window.__game.scene.sprites.get(id)?.visible, buildingId),
    ).toBe(false);
    await page.screenshot({
      path: `output/playtest/village-${scenario.part}-${scenario.online}-${scenario.scouting}-recovered.png`,
    });
    if (scenario.scouting)
      expect(
        await page.evaluate(() => ({
          elapsed: window.__game.model.battle?.elapsed,
          started: window.__game.model.battle?.started,
        })),
      ).toEqual({ elapsed: 0, started: false });
    expect(errors).toEqual([]);
  });
}
