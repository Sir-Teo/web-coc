import { test, expect, type Page } from '@playwright/test';

type Shared = { name: string; type: string; text: string; title?: string };

/** A share sheet that records what it was given, or one the player closes, or none at all. */
async function stubShare(page: Page, mode: 'share' | 'cancel' | 'no-json') {
  await page.addInitScript((mode) => {
    const shared: Shared[] = [];
    (window as unknown as { shared: Shared[] }).shared = shared;
    Object.defineProperty(navigator, 'canShare', {
      configurable: true,
      writable: true,
      value: (data: ShareData) =>
        mode !== 'no-json' || !data.files?.some((f) => f.type === 'application/json'),
    });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: async (data: ShareData) => {
        if (mode === 'cancel') throw new DOMException('Share canceled', 'AbortError');
        for (const file of data.files ?? [])
          shared.push({
            name: file.name,
            type: file.type,
            text: await file.text(),
            title: data.title,
          });
      },
    });
  }, mode);
}

const shared = (page: Page) =>
  page.evaluate(() => (window as unknown as { shared: Shared[] }).shared);

async function boot(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await expect(page.locator('#loading')).toBeHidden();
}

async function exportVillage(page: Page) {
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('[data-action="export"]').click();
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('the village backup and a replay open the share sheet instead of downloading', async ({
    page,
  }) => {
    await stubShare(page, 'share');
    await boot(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));

    await exportVillage(page);
    await expect(page.locator('#toast')).toContainText('Your village backup has been exported');
    const [village] = await shared(page);
    expect(village).toMatchObject({
      name: 'crown-and-clan-village.json',
      type: 'application/json',
      title: 'Crown & Clan village',
    });
    // The shared file restores through the game's own import.
    expect(
      await page.evaluate(async (text) => {
        const { parseSaveFile } = await import('/src/game/save.ts');
        return parseSaveFile(text) !== null;
      }, village.text),
    ).toBe(true);

    // A raid long enough to record, then its replay's export.
    await page.locator('.modal [data-action="close"]').click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.army.swordsman = 10;
      m.changed();
      m.startCampaign(0);
      outer: for (let x = 1.5; x < 44; x++)
        for (let y = 1.5; y < 44; y++)
          if (!m.deployBlocked(x, y)) {
            m.deploy(x, y);
            break outer;
          }
      window.advanceTime(10_000);
      m.finishBattle();
      m.returnHome();
      m.startReplay(m.state.raidLog![0].id);
      m.changed();
    });
    await page.locator('[data-action="replay-export"]').click();
    await expect.poll(async () => (await shared(page)).length).toBe(2);
    const replay = (await shared(page))[1];
    expect(replay).toMatchObject({
      name: 'crown-and-clan.crown-replay.json',
      type: 'application/json',
    });
    expect(JSON.parse(replay.text).format).toBe('crown-clan-replay');
    expect(downloaded).toBe(false);
  });

  test('closing the share sheet exports nothing and says nothing', async ({ page }) => {
    await stubShare(page, 'cancel');
    await boot(page);
    let downloaded = false;
    page.on('download', () => (downloaded = true));
    await exportVillage(page);
    await page.waitForTimeout(500);
    await expect(page.locator('#toast')).not.toContainText('exported');
    expect(downloaded).toBe(false);
  });

  test('a browser that will not share JSON downloads as before', async ({ page }) => {
    await stubShare(page, 'no-json');
    await boot(page);
    const download = page.waitForEvent('download');
    await exportVillage(page);
    expect((await download).suggestedFilename()).toBe('crown-and-clan-village.json');
    expect(await shared(page)).toEqual([]);
  });
});

test('a mouse downloads even where the browser could share', async ({ page }) => {
  await stubShare(page, 'share');
  await boot(page);
  const download = page.waitForEvent('download');
  await exportVillage(page);
  expect((await download).suggestedFilename()).toBe('crown-and-clan-village.json');
  expect(await shared(page)).toEqual([]);
});
