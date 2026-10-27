import { expect, test, type Page } from '@playwright/test';
import { GameModel, initialSave, makeBuilding } from '../../src/game/model';
import { emptyArmy } from '../../src/game/army';
import { validateSave } from '../../src/game/save';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const defenses = [
  {
    kind: 'xbow',
    later: 13,
    key: 'xbow-13-both',
    path: '**/assets/buildings/xbow-native/preview-13-both.png',
    standin: 'xbow-1-both',
    initial: ['xbow-1-both', 'xbow-1-ground', 'xbow-6-both', 'xbow-6-ground'],
  },
  {
    kind: 'wizardtower',
    later: 17,
    key: 'wizardtower-17',
    path: '**/assets/buildings/wizard-tower-native/preview-17.png',
    standin: 'wizardtower',
    initial: ['wizardtower', 'wizardtower-6'],
  },
] as const;

type Defense = (typeof defenses)[number];

async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}

async function addDefense(page: Page, kind: Defense['kind'], level = 6) {
  const id = await page.evaluate(
    async ({ kind, level }) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model, scene } = window.__game;
      const building = makeBuilding(model.state.nextId++, kind, 32, 32, level);
      model.state.buildings.push(building);
      model.changed();
      scene.sync();
      return building.id;
    },
    { kind, level },
  );
  await page.waitForFunction(() => window.__game.scene.artSettled);
  return id;
}

async function holdPortrait(page: Page, path: string) {
  let release!: () => void;
  let requested = false;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route(path, async (route) => {
    requested = true;
    await gate;
    await route.continue();
  });
  return { release, wait: () => expect.poll(() => requested).toBe(true) };
}

for (const defense of defenses) {
  test(`${defense.kind} phone boot loads only current and placement portraits`, async ({
    page,
  }) => {
    const state = initialSave();
    state.tutorial = true;
    state.obstacles = [];
    state.army = emptyArmy();
    state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 18),
      makeBuilding(2, 'builder', 26, 26),
      makeBuilding(3, defense.kind, 10, 10, 6),
    ];
    state.nextId = 4;
    const save = new GameModel(state).state;
    expect(validateSave(save)).toBe(true);
    await page.addInitScript(
      (save) => localStorage.setItem('crown-clan-save-v1', save),
      JSON.stringify(save),
    );
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(
      await page.evaluate(
        (kind) =>
          window.__game.scene.textures
            .getTextureKeys()
            .filter((key) =>
              kind === 'xbow'
                ? /^xbow-\d+-(ground|both)$/.test(key)
                : key === 'wizardtower' || /^wizardtower-\d+$/.test(key),
            )
            .sort(),
        defense.kind,
      ),
    ).toEqual([...defense.initial]);
  });

  test(`${defense.kind} later portrait refreshes a moving preview after decode`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page);
    const id = await addDefense(page, defense.kind);
    const gate = await holdPortrait(page, defense.path);
    try {
      await page.evaluate(
        ({ id, kind, level }) => {
          const { model, scene } = window.__game;
          const building = model.state.buildings.find((building) => building.id === id)!;
          building.level = level;
          if (kind === 'xbow') building.xbowMode = 'both';
          model.changed();
          model.move(id);
          scene.sync();
        },
        { id, kind: defense.kind, level: defense.later },
      );
      await gate.wait();
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.ghost.texture.key))
        .toBe(defense.standin);
      gate.release();
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.ghost.texture.key))
        .toBe(defense.key);
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });

  test(`${defense.kind} owns a pending later portrait through release and reload`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await boot(page);
    const id = await addDefense(page, defense.kind);
    const gate = await holdPortrait(page, defense.path);
    try {
      await page.evaluate(
        ({ id, kind, level }) => {
          const { model, scene } = window.__game;
          const building = model.state.buildings.find((building) => building.id === id)!;
          building.level = level;
          if (kind === 'xbow') building.xbowMode = 'both';
          model.changed();
          scene.sync();
        },
        { id, kind: defense.kind, level: defense.later },
      );
      await gate.wait();
      const retained = await page.evaluate(
        ({ id, kind, key }) => {
          const { model, scene } = window.__game;
          model.state.buildings = model.state.buildings.filter((building) => building.id !== id);
          model.changed();
          scene.sync();
          scene.familyCheckAt = 0;
          scene.familyIdleSince = 0;
          scene.releaseIdleFamilies(scene.time.now + 21_000);
          const family = scene.deferredFamilies.find((family) => family.draws({ kind }));
          return {
            loaded: scene.loadedFamilies.has(family),
            owned: scene.familyTextures.get(family)?.includes(key),
            pending: scene.deferredArt.loading(key),
          };
        },
        { id, kind: defense.kind, key: defense.key },
      );
      expect(retained).toEqual({ loaded: true, owned: true, pending: true });
      gate.release();
      await page.waitForFunction((key) => window.__game.scene.textures.exists(key), defense.key);
      const released = await page.evaluate(
        ({ kind, key }) => {
          const { scene } = window.__game;
          scene.familyCheckAt = 0;
          scene.familyIdleSince = 0;
          scene.releaseIdleFamilies(scene.time.now + 43_000);
          const family = scene.deferredFamilies.find((family) => family.draws({ kind }));
          return { loaded: scene.loadedFamilies.has(family), portrait: scene.textures.exists(key) };
        },
        { kind: defense.kind, key: defense.key },
      );
      expect(released).toEqual({ loaded: false, portrait: false });
      await addDefense(page, defense.kind, defense.later);
      // X-Bow batches retain both modes of the newly needed level.
      expect(
        await page.evaluate((key) => window.__game.scene.textures.exists(key), defense.key),
      ).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      gate.release();
    }
  });
}
