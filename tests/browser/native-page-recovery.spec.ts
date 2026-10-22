import { test, expect } from '@playwright/test';

for (const actor of [
  { name: 'Cannon', part: 'cannon', kind: 'cannon', tag: 'nativeCannon' },
  { name: 'Archer Tower body', part: 'body', kind: 'archertower', tag: 'nativeTowerArcher' },
  {
    name: 'Archer Tower resident',
    part: 'resident',
    kind: 'archertower',
    tag: 'nativeTowerArcher',
  },
]) {
  for (const online of [false, true]) {
    test(`${actor.name} page recovers ${online ? 'on reconnect' : 'after a temporary failure'} while scouting`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // Warm the shared pages and starter levels before failing a newly encountered level.
      await page.goto('/');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const path = await page.evaluate(async (part) => {
        const graph =
          part === 'cannon'
            ? (await import('/src/game/cannon-poses.ts')).CANNON_GRAPH
            : (await import('/src/game/archer-tower-art.ts'))[
                part === 'body' ? 'ARCHER_TOWER_GRAPH' : 'TOWER_ARCHER_GRAPH'
              ];
        const texture = Object.values(graph.textures).find(
          (row) => row.levels?.includes(21) && !row.levels.includes(1) && !row.levels.includes(2),
        );
        if (!texture) throw Error('No exclusive level 21 page');
        return '/' + texture.path;
      }, actor.part);
      let attempts = 0;
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === path) attempts++;
      });
      const pattern = '**' + path;
      await page.route(pattern, (route) =>
        route.fulfill({ status: 503, body: 'Temporary outage' }),
      );
      await page.evaluate(async (kind) => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { model, scene } = window.__game;
        // No collectors or construction timers: recovery must wake a truly cached world frame.
        model.state.obstacles = [];
        model.state.buildings = [
          makeBuilding(1000, 'townhall', 20, 20, 2),
          makeBuilding(1001, kind, 15, 15, 1),
        ];
        model.state.nextId = 1002;
        model.startBattle(0, true);
        model.battle!.buildings = [
          makeBuilding(1000, 'townhall', 20, 20, 2),
          makeBuilding(1001, kind, 15, 15, 21),
        ];
        model.changed();
        scene.sync();
      }, actor.kind);
      await expect.poll(() => attempts).toBeGreaterThan(0);
      await expect
        .poll(() =>
          page.evaluate(() => {
            const sprite = window.__game.scene.sprites.get(1001);
            return (
              !!sprite?.visible &&
              sprite.alpha > 0 &&
              !['__MISSING', '__DEFAULT'].includes(sprite.texture.key)
            );
          }),
        )
        .toBe(true);
      await page.waitForTimeout(1200);
      expect(attempts).toBe(1);
      await page.unroute(pattern);
      if (online) {
        await page.evaluate(() => window.dispatchEvent(new Event('online')));
        await expect.poll(() => attempts, { timeout: 2000 }).toBeGreaterThan(1);
      }
      await expect
        .poll(
          () =>
            page.evaluate(
              (tag) =>
                window.__game.scene.children.list.some(
                  (object) =>
                    object.visible && object.alpha > 0 && object.getData?.(tag)?.id === 1001,
                ),
              actor.tag,
            ),
          { timeout: 12000 },
        )
        .toBe(true);
      expect(
        await page.evaluate(() => ({
          elapsed: window.__game.model.battle!.elapsed,
          started: window.__game.model.battle!.started,
          fallbackAlpha: window.__game.scene.sprites.get(1001)?.alpha,
        })),
      ).toEqual({ elapsed: 0, started: false, fallbackAlpha: 0 });
      await page.screenshot({
        path: `output/playtest/native-page-${actor.part}-${online}-recovered.png`,
      });
      expect(errors).toEqual([]);
    });
  }
}
