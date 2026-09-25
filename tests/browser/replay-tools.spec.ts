import { useDevelopedVillage } from './developed-village';
import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await useDevelopedVillage(page);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const m = window.__game.model;
    m.startBattle(0, true);
    for (let i = 0; i < 50; i++) m.step(0.05);
    m.activeTroop = 'giant';
    m.deploy(1.2, 13);
    for (let i = 0; i < 1200; i++) m.step(0.05);
    m.finishBattle();
    m.returnHome();
  });
  await page.locator('[data-action="battle-log"]').click();
});

test('playback targets stay reachable at narrow portrait and landscape sizes', async ({ page }) => {
  await page.evaluate(() =>
    window.__game.hud.toast('Deploy on the grass outside the red boundary.'),
  );
  await page.getByRole('button', { name: 'Watch replay' }).click();
  await expect(page.locator('#toast')).not.toHaveClass(/show/, { timeout: 500 });
  await page.locator('[data-action="replay-pause"]').click();
  for (const [width, height] of [
    [320, 740],
    [390, 844],
    [701, 390],
    [844, 390],
  ]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(
      (width) => window.__game.scene.cameras.main.width === Math.floor(width * window.devicePixelRatio),
      width,
    );
    const controls = page.getByRole('region', { name: 'Replay playback' });
    for (const control of await controls.locator('button, input').all()) {
      await expect(control).toBeInViewport({ ratio: 1 });
      await expect
        .poll(async () => {
          const box = await control.boundingBox();
          return !!box && box.width >= 44 && box.height >= 44;
        })
        .toBe(true);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const box = (await controls.boundingBox())!;
    expect(box.y).toBeGreaterThan(120);
    await page.screenshot({
      path: `output/playtest/replay-controls-${width}-${test.info().project.name}.png`,
    });
  }
});

for (const mobile of [false, true])
  test(`seeks backwards, revives sprites, and preserves camera on ${mobile ? 'phone' : 'desktop'}`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Watch replay' }).click();
    await page.locator('[data-action="replay-pause"]').click();
    const range = page.getByRole('slider', { name: 'Replay position' });
    await range.focus();
    await range.press('End');
    await expect(page.locator('.replay-status')).toContainText('Replay complete');
    await page.waitForTimeout(450);
    const camera = await page.evaluate(() => {
      const { scene } = window.__game;
      scene.zoomBy(1.1);
      return {
        x: scene.cameras.main.scrollX,
        y: scene.cameras.main.scrollY,
        zoom: scene.cameras.main.zoom,
      };
    });
    await range.focus();
    await range.press('Home');
    await expect(page.locator('.replay-status')).toContainText('Replay paused');
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBe(0);
    await page.locator('[data-action="replay-skip"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBeCloseTo(2.5);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          const u = model.battle.units[0];
          const im = scene.unitSprites.get(u?.id);
          return !!u && u.hp > 0 && !!im?.visible && im.alpha === 1;
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(() => {
        const c = window.__game.scene.cameras.main;
        return { x: c.scrollX, y: c.scrollY, zoom: c.zoom };
      }),
    ).toEqual(camera);
    await page.locator('[data-action="replay-jump:10"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    await page.locator('[data-action="replay-jump:-10"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.time)).toBeCloseTo(2.5);
    // Seeking can replace the controls between locator resolution and layout measurement.
    await expect(range).toBeEnabled();
    let track = await range.boundingBox();
    await expect.poll(async () => (track = await range.boundingBox())).not.toBeNull();
    if (!track) throw new Error('Replay slider has no visible bounds');
    await page.mouse.move(track.x + track.width * 0.15, track.y + track.height / 2);
    await page.mouse.down();
    await range.evaluate((el) => el.setAttribute('data-drag-marker', 'kept'));
    const draggedValue = await range.inputValue();
    // Safari pointer interaction need not grant keyboard focus to a range input.
    await range.evaluate((el) => el.blur());
    await page.evaluate(() => window.__game.model.changed());
    await page.waitForTimeout(80);
    await expect(range).toHaveAttribute('data-drag-marker', 'kept');
    await expect(range).toHaveValue(draggedValue);
    await page.mouse.move(track.x + track.width * 0.5, track.y + track.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    expect(await page.evaluate(() => window.__game.model.replay.time)).toBeGreaterThan(25);
    expect(await page.evaluate(() => window.__game.model.replay.time)).toBeLessThan(38);
    await page.locator('[data-action="replay-skip"]').click();
    await expect.poll(() => page.evaluate(() => window.__game.model.replay.seeking)).toBe(false);
    await page.screenshot({
      path: `output/playtest/replay-seek-${mobile ? 'phone' : 'desktop'}.png`,
    });
    if (mobile) {
      await page.setViewportSize({ width: 844, height: 390 });
      await page.screenshot({ path: 'output/playtest/replay-seek-landscape.png' });
    }
    await page.locator('[data-action="replay-exit"]').click();
    expect(errors).toEqual([]);
  });
test('downloads a recording, opens it without replacing the village, and rejects bad files', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const before = await page.evaluate(() => {
    const s = window.__game.model.state;
    return {
      army: s.army,
      spells: s.spells,
      gold: s.gold,
      elixir: s.elixir,
      nextId: s.nextId,
      log: s.raidLog,
    };
  });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export replay' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('crown-and-clan.crown-replay.json');
  const bytes = await fs.readFile((await download.path())!);
  const file = JSON.parse(bytes.toString());
  expect(file.format).toBe('crown-clan-replay');
  expect(file.gold).toBeUndefined();
  const upload = async (buffer: Buffer) => {
    const choose = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: 'Open shared replay' }).click();
    await (
      await choose
    ).setFiles({ name: 'shared.crown-replay.json', mimeType: 'application/json', buffer });
  };
  await upload(Buffer.from('{}'));
  await expect(page.locator('#toast')).toContainText('replay file');
  await expect(page.locator('.battle-log-body')).toBeVisible();
  await upload(bytes);
  await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
  await expect(page.locator('.battle-enemy')).toContainText('Shared village');
  await page.locator('[data-action="replay-pause"]').click();
  await page.screenshot({ path: 'output/playtest/replay-imported.png' });
  await page.locator('[data-action="replay-restart"]').click();
  await expect(page.locator('.replay-status')).toContainText('Watching replay');
  await page.locator('[data-action="replay-exit"]').click();
  expect(
    await page.evaluate(() => {
      const s = window.__game.model.state;
      return {
        army: s.army,
        spells: s.spells,
        gold: s.gold,
        elixir: s.elixir,
        nextId: s.nextId,
        log: s.raidLog,
      };
    }),
  ).toEqual(before);
  const wrong = structuredClone(file);
  wrong.replay.version++;
  await upload(Buffer.from(JSON.stringify(wrong)));
  await expect(page.locator('#toast')).toContainText('different game version');
  await upload(bytes);
  await expect(page.locator('.battle-enemy')).toContainText('SHARED REPLAY');
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.replay)).toBe(null);
  await page.locator('[data-action="battle-log"]').click();
  await expect(page.locator('.raid-record')).toHaveCount(1);
  expect(errors).toEqual([]);
});
