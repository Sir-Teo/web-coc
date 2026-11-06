import { test, expect, type Page } from '@playwright/test';
import { decodeArmy, encodeArmy, armyLink } from '../../src/game/army-share';
import { emptyArmy, emptySpells } from '../../src/game/army';

const shared = (troops = 4) =>
  encodeArmy({
    name: 'Travel <army> 🐲',
    army: { ...emptyArmy(), swordsman: troops },
    spells: emptySpells(),
  })!;
async function ready(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    window.__game.game.loop.sleep();
    const m = window.__game.model;
    m.clearArmy();
    m.train('swordsman', 4);
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="army-presets"]').click();
  await expect(page.locator('#modal-title')).toHaveText('Quick armies');
}
async function clipboard(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text: string) => {
          window.__copied = text;
        },
      },
      configurable: true,
    });
  });
}

for (const [width, height] of [
  [390, 844],
  [844, 390],
  [1440, 960],
]) {
  test(`army links share saved and current compositions and preview before applying at ${width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height });
    await ready(page);
    await clipboard(page);
    await page.locator('#preset-name-0').fill('Travel army');
    await page.locator('[data-action="preset-save:0"]').click();
    await page.locator('[data-action="army-share:0"]').click();
    await expect(page.locator('#toast')).toContainText('Army link copied');
    const link = await page.evaluate(() => window.__copied as string);
    expect(decodeArmy(new URL(link).hash.slice('#army='.length))).toMatchObject({
      name: 'Travel army',
      army: { swordsman: 4 },
    });
    await page.locator('[data-action="army-share:current"]').click();
    const current = await page.evaluate(() => window.__copied as string);
    expect(decodeArmy(new URL(current).hash.slice('#army='.length))).toMatchObject({
      name: 'Shared army',
      army: { swordsman: 4 },
    });
    await page.evaluate(() => window.__game.model.clearArmy());
    const code = shared();
    await page.evaluate((code) => {
      location.hash = `army=${code}`;
    }, code);
    await expect(page.locator('#army-code')).toHaveValue(code);
    expect(new URL(page.url()).hash).toBe('');
    await expect(page.locator('.army-import-preview h4')).toHaveText('Travel <army> 🐲');
    expect(await page.evaluate(() => window.__game.model.armySize)).toBe(0);
    await expect(page.locator('[data-action="army-import"]')).toBeEnabled();
    await page.locator('.modal').evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished));
    });
    for (const target of [
      '[data-action="army-import"]',
      '[data-action="army-share:0"]',
      '[data-action="army-share:current"]',
      '#army-code',
    ])
      expect((await page.locator(target).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.locator('.army-import').scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `output/playtest/army-share-${width}-${browserName}.png`,
      animations: 'disabled',
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.locator('[data-action="army-import"]').click();
    expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(4);
    await expect(page.locator('#army-code')).toHaveValue('');
    await page.locator('#army-code').fill(shared(1000));
    await expect(page.locator('.army-import-preview')).toContainText(
      'needs more troop or spell housing',
    );
    await expect(page.locator('[data-action="army-import"]')).toBeDisabled();
    await page.locator('#army-code').fill('https://example.test/#army=%ZZ');
    await expect(page.locator('.army-import-preview')).toContainText('damaged or unsupported');
    await expect(page.locator('[data-action="army-import"]')).toHaveCount(0);
    expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(4);
    expect(errors).toEqual([]);
  });
}

test('a refused share sheet copies the link and preserves the import draft', async ({ page }) => {
  await ready(page);
  await clipboard(page);
  await page.locator('#army-code').fill('draft');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('Blocked', 'NotAllowedError');
      },
      configurable: true,
    });
  });
  await page.locator('[data-action="army-share:current"]').click();
  await expect(page.locator('#toast')).toContainText('Army link copied');
  await expect(page.locator('#army-code')).toHaveValue('draft');
  const link = await page.evaluate(() => window.__copied as string);
  expect(decodeArmy(new URL(link).hash.slice('#army='.length))?.army.swordsman).toBe(4);
  await page.screenshot({ path: 'output/playtest/army-share-clipboard-fallback.png' });
});

for (const refused of ['share', 'clipboard'] as const) {
  test(`refused ${refused} leaves an army link selected for copying by hand`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page);
    await page.evaluate((refused) => {
      Object.defineProperty(navigator, 'share', {
        value:
          refused === 'share'
            ? async () => {
                throw new DOMException('Blocked', 'NotAllowedError');
              }
            : undefined,
        configurable: true,
      });
      Object.defineProperty(navigator, 'clipboard', {
        value: {
          writeText: async () => {
            throw new DOMException('Blocked', 'NotAllowedError');
          },
        },
        configurable: true,
      });
    }, refused);
    await page.locator('[data-action="army-share:current"]').click();
    const field = page.locator('#army-code');
    await expect(field).toBeFocused();
    expect(
      await field.evaluate(
        (input: HTMLInputElement) => input.selectionEnd! - input.selectionStart!,
      ),
    ).toBe((await field.inputValue()).length);
    expect(await field.inputValue()).toContain('#army=1.');
    await expect(page.locator('[data-action="army-import"]')).toBeEnabled();
    await expect(page.locator('#toast')).toContainText('Copy the army link');
  });
}

test('a dismissed share sheet keeps the army and the existing import draft', async ({ page }) => {
  await ready(page);
  await page.locator('#army-code').fill('draft');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', {
      value: async () => {
        throw new DOMException('Dismissed', 'AbortError');
      },
      configurable: true,
    });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw Error('Clipboard must not run after cancellation');
        },
      },
      configurable: true,
    });
  });
  await page.locator('[data-action="army-share:current"]').click();
  await expect(page.locator('#army-code')).toHaveValue('draft');
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(4);
});

test('a link opens from a fresh navigation as a preview without replacing the army', async ({
  page,
}) => {
  await ready(page);
  const link = armyLink(page.url(), shared(5));
  const before = await page.evaluate(() => window.__game.model.state.army.swordsman);
  await page.goto('about:blank');
  await page.goto(link);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.evaluate(() => window.__game.game.loop.sleep());
  await expect(page.locator('#modal-title')).toHaveText('Quick armies');
  await expect(page.locator('.army-import-preview h4')).toHaveText('Travel <army> 🐲');
  expect(new URL(page.url()).hash).toBe('');
  expect(await page.evaluate(() => window.__game.model.state.army.swordsman)).toBe(before);
});

test('a link received during an attack waits for return home without changing the battle', async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-action="close"]').click();
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    scene.paused = true;
    model.startBattle(0, true);
    return JSON.stringify(model.battle);
  });
  await page.evaluate((code) => {
    location.hash = `army=${code}`;
  }, shared());
  await expect(page.locator('#toast')).toContainText('Return home');
  await expect(page.locator('#modal-title')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
  await page.evaluate(() => window.__game.model.returnHome());
  // Returning restores the Army drawer that was open before this practice attack.
  await page.locator('[data-action="army-presets"]').click();
  await expect(page.locator('.army-import-preview h4')).toHaveText('Travel <army> 🐲');
});
