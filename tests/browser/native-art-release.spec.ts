import { test, expect, type Page } from '@playwright/test';

async function warmArmy(page: Page, actor: { stage: number; name: string }) {
  await page.evaluate(({ stage, name }) => {
    const { model, scene } = window.__game;
    model.townhall!.level = 13;
    model.startCampaign(stage, false);
    scene.sync();
    // Warm the provided army before deployment, then leave while that work is pending.
    if (name === 'troop') scene.troopNativePresentation.prefetch(['giant'], () => 2);
    else scene.heroNativePresentation.prefetch(['heroes-native/king']);
  }, actor);
}

for (const actor of [
  {
    name: 'troop',
    stage: 90,
    prefix: 'troop:giant:',
    metadata: '**/assets/troops-native/giant/graph.json',
    texture: '**/assets/troops-native/giant/chr_giant/texture-0.png',
  },
  {
    name: 'hero',
    stage: 93,
    prefix: 'baked:heroes-native/king/',
    metadata: '**/assets/characters/king-v1/atlas.json',
    texture: '**/assets/characters/king-v1/front-right.webp',
  },
]) {
  for (const phase of ['metadata', 'texture'] as const) {
    test(`returning home releases native ${actor.name} art still loading its ${phase}`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let requested = false;
      let url = actor[phase];
      if (phase === 'texture' && actor.name === 'troop') {
        // Vite serves level-paged packs, whose texture URLs differ from the source JSON.
        const pack = await (
          await page.request.get('/assets/troops-native/giant/graph.json')
        ).json();
        const textures = pack.scenes.chr_giant.textures as Record<
          string,
          { path: string; levels?: number[] }
        >;
        const texture = Object.values(textures).find(
          (row) => !row.levels || row.levels.includes(2),
        );
        if (!texture) throw Error('No Giant level 2 texture');
        url = `**/${texture.path}`;
      }
      await page.route(url, async (route) => {
        requested = true;
        await gate;
        await route.continue();
      });
      try {
        await page.goto('/?lazyart');
        await page.waitForFunction(() => window.__game?.scene.artSettled);
        await page.locator('[data-action="skip-tutorial"]').click();
        await warmArmy(page, actor);
        await expect.poll(() => requested).toBe(true);
        await page.evaluate(() => {
          const { model, scene } = window.__game;
          model.returnHome();
          scene.sync();
        });
        const response = page.waitForResponse(url);
        release();
        await (await response).finished();
        // Let completed metadata, decode work and any follow-up page requests settle.
        await page.waitForFunction(() => {
          const scene = window.__game.scene;
          return (
            !scene.heroNativePresentation.pending.size &&
            !scene.troopNativePresentation.pending.size &&
            !scene.troopNativePresentation.pendingLevels.size
          );
        });
        const textures = await page.evaluate(
          (prefix) =>
            window.__game.game.textures.getTextureKeys().filter((key) => key.startsWith(prefix)),
          actor.prefix,
        );
        expect(textures).toEqual([]);
        expect(errors).toEqual([]);
      } finally {
        release();
      }
    });
  }

  test(`an obsolete native ${actor.name} request cannot clear a fresh battle's load`, async ({
    page,
  }) => {
    let releaseFirst!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const second = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let requests = 0;
    await page.route(actor.metadata, async (route) => {
      const number = ++requests;
      if (number === 1) await first;
      else if (number === 2) await second;
      await route.continue();
    });
    try {
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      await warmArmy(page, actor);
      await expect.poll(() => requests).toBe(1);
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        scene.sync();
      });
      await warmArmy(page, actor);
      await expect.poll(() => requests).toBe(2);
      const oldResponse = page.waitForResponse(actor.metadata);
      releaseFirst();
      await (await oldResponse).finished();
      await page.evaluate(async ({ name }) => {
        const scene = window.__game.scene;
        if (name === 'troop') scene.troopNativePresentation.prefetch(['giant'], () => 2);
        else scene.heroNativePresentation.prefetch(['heroes-native/king']);
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
      }, actor);
      expect(requests).toBe(2);
      releaseSecond();
      await expect
        .poll(() =>
          page.evaluate(
            (prefix) =>
              window.__game.game.textures.getTextureKeys().some((key) => key.startsWith(prefix)),
            actor.prefix,
          ),
        )
        .toBe(true);
    } finally {
      releaseFirst();
      releaseSecond();
    }
  });
}
