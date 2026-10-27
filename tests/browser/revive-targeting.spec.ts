import { expect, test, type Page } from '@playwright/test';
import { reviveTargetingRecording } from '../fixtures/revive-targeting';
async function boot(page: Page) {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
}
async function live(page: Page) {
  await boot(page);
  await page.evaluate(async () => {
    const { prepareReviveTargeting } = await import('/tests/fixtures/revive-targeting.ts'),
      { model, scene } = window.__game;
    scene.paused = true;
    const emit = model.onEffect;
    model.onEffect = () => {};
    try {
      const r = prepareReviveTargeting(model);
      window.__revive = { id: r.queenId, at: r.knocked };
    } finally {
      model.onEffect = emit;
    }
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  });
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const { scene } = window.__game;
          scene.sync();
          scene.drawOverlay(0);
          return (
            scene.reviveTargets.hasArt(window.__game.model.battle) &&
            scene.reviveTargets.targets.length === 1 &&
            !scene.battleArtPending()
          );
        }),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.evaluate(() => {
    const { scene } = window.__game,
      box = scene.reviveTargets.targets[0],
      cam = scene.cameras.main;
    cam
      .setZoom(window.innerWidth < 500 ? 0.9 : 1.15)
      .centerOn((box.left + box.right) / 2, (box.top + box.bottom) / 2 + 30);
    scene.drawOverlay(0);
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}
async function redraw(page: Page) {
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.changed();
    scene.sync();
    scene.drawOverlay(0);
  });
}
for (const { mode, width, touch } of [
  { mode: 'bar', width: 1440, touch: false },
  { mode: 'keyboard', width: 1440, touch: false },
  { mode: 'marker', width: 390, touch: true },
] as const) {
  test.describe(`${mode} Revive targeting`, () => {
    test.use({ viewport: { width, height: 960 }, hasTouch: touch, isMobile: touch });
    test(`targets the knocked-out Queen at ${width}px without deploying another unit`, async ({
      page,
    }) => {
      test.setTimeout(120000);
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await live(page);
      const card = page.locator('[data-action="hero-select:queen"]');
      await expect(card).toBeDisabled();
      if (mode === 'marker') {
        await page.evaluate(() => window.__game.model.toggleReducedMotion());
        await redraw(page);
        const still = await page.evaluate(() => {
          const { model, scene } = window.__game,
            before = JSON.stringify(model.battle);
          const objects = scene.children.list.filter(
            (o) => o.getData?.('nativeEffect') === 'hero_revivable' && o.visible && o.alpha > 0,
          );
          return {
            visible: objects.length > 0,
            unchanged: before === JSON.stringify(model.battle),
          };
        });
        expect(still).toEqual({ visible: true, unchanged: true });
        await page.screenshot({ path: 'output/playtest/revive-target-heart-touch.png' });
        const point = await page.evaluate(() => {
          const { game, scene } = window.__game,
            box = scene.reviveTargets.targets[0],
            cam = scene.cameras.main,
            rect = game.canvas.getBoundingClientRect(),
            x = (box.left + box.right) / 2,
            y = (box.top + box.bottom) / 2;
          return {
            x:
              rect.left +
              ((cam.x + cam.width / 2 + (x - cam.midPoint.x) * cam.zoom) * rect.width) /
                game.scale.width,
            y:
              rect.top +
              ((cam.y + cam.height / 2 + (y - cam.midPoint.y) * cam.zoom) * rect.height) /
                game.scale.height,
          };
        });
        await page.touchscreen.tap(point.x, point.y);
      } else {
        await page.locator('[data-action="spell:revive"]').click();
        await expect(card).toBeEnabled();
        await expect(card).toHaveAccessibleName('Archer Queen, Revive Queen');
        if (mode === 'bar') {
          await card.focus();
          await page.keyboard.press('Enter');
        } else await page.keyboard.press('h');
      }
      await redraw(page);
      expect(
        await page.evaluate(() => {
          const { model } = window.__game,
            action = model.recording.actions.filter(
              (a) => a.type === 'spell' && a.kind === 'revive',
            );
          return {
            count: model.battle.spells.revive,
            actions: action.length,
            target: action[0]?.targetHero,
            giant: model.battle.units.filter((u) => u.kind === 'giant').length,
            remaining: model.battle.remaining.giant,
            spell: model.activeSpell,
          };
        }),
      ).toMatchObject({
        count: 1,
        actions: 1,
        target: 'queen',
        giant: 0,
        remaining: 1,
        ...(mode === 'marker' ? { spell: null } : {}),
      });
      await expect(card).toHaveAccessibleName('Archer Queen, Reviving');
      await expect(card).toBeDisabled();
      expect(await page.evaluate(() => window.__game.scene.reviveTargets.targets.length)).toBe(0);
      await page.evaluate(() => {
        for (let i = 0; i < 31; i++) window.__game.model.step(0.05);
      });
      await redraw(page);
      expect(
        await page.evaluate(
          () => window.__game.model.battle.units.find((u) => u.id === window.__revive.id).hp,
        ),
      ).toBeGreaterThan(0);
      await page.screenshot({ path: `output/playtest/revive-target-${mode}-${width}.png` });
      expect(errors).toEqual([]);
    });
  });
}
async function replayAtKnockout(
  page: Page,
  r: ReturnType<typeof reviveTargetingRecording>,
  version: number,
) {
  await page.evaluate(
    async ({ r, version }) => {
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts'),
        { model, scene } = window.__game,
        data = structuredClone(r.data);
      data.version = version;
      if (version < 123) for (const action of data.actions) delete action.targetHero;
      scene.paused = true;
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data)))))
        throw Error('Revive replay rejected');
      model.seekReplay(r.knocked);
      while (model.replay.seeking) model.step(0.05);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    },
    { r, version },
  );
}
test('version-122 playback stays read-only and never requests the new marker', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(new URL(r.url()).pathname));
  await boot(page);
  await replayAtKnockout(page, reviveTargetingRecording(), 122);
  expect(await page.evaluate(() => window.__game.scene.reviveTargets.targets.length)).toBe(0);
  expect(await page.evaluate(() => window.__game.model.castReviveOnHero('queen'))).toBe(false);
  await expect(
    page.getByRole('button', { name: 'Archer Queen, Revive Queen', exact: true }),
  ).toHaveCount(0);
  expect(requests).not.toContain('/assets/revive-native/target/graph.json');
});
test('a paused knockout recovers the original Revive marker after its pack fails and reconnects', async ({
  page,
}) => {
  test.setTimeout(120000);
  let release!: () => void,
    rejecting = true,
    requests = 0;
  const held = new Promise<void>((resolve) => (release = resolve)),
    errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/assets/revive-native/target/graph.json', async (route) => {
    requests++;
    await held;
    if (rejecting) await route.fulfill({ status: 503, body: 'Temporary marker failure' });
    else await route.continue();
  });
  await boot(page);
  await replayAtKnockout(page, reviveTargetingRecording(), 123);
  await expect.poll(() => requests).toBeGreaterThan(0);
  const before = await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.replay.paused = true;
    scene.paused = false;
    model.changed();
    return JSON.stringify(model.battle);
  });
  release();
  await page.waitForFunction(
    () => window.__game.scene.reviveTargets.layer.status('hero_revive_indicator') === 'none',
  );
  rejecting = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          window.__game.scene.children.list.some(
            (o) => o.getData?.('nativeEffect') === 'hero_revivable' && o.visible && o.alpha > 0,
          ),
        ),
      { timeout: 30000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
  expect(await page.evaluate(() => window.__game.model.castReviveOnHero('queen'))).toBe(false);
  expect(errors).toEqual([]);
});
test('an earlier tile Revive clears the busy Hero card even while a direct cast remains queued', async ({
  page,
}) => {
  test.setTimeout(120000);
  await live(page);
  await page.evaluate(() => {
    const { model } = window.__game,
      unit = model.battle.units.find((u) => u.hero === 'queen');
    model.activeSpell = 'revive';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Tile cast failed');
    const first = model.battle.nativeSpells.find((c) => c.name === 'Revive').firstHit;
    model.step(0.05);
    if (!model.castReviveOnHero('queen')) throw Error('Direct cast failed');
    while (model.battle.elapsed < first - 1e-9) model.step(0.05);
  });
  await redraw(page);
  expect(
    await page.evaluate(() =>
      window.__game.model.battle.nativeSpells.some(
        (c) => c.name === 'Revive' && c.reviveTargetId !== undefined,
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() => window.__game.model.battle.units.find((u) => u.hero === 'queen').hp),
  ).toBeGreaterThan(0);
  await expect(page.locator('[data-action="hero-select:queen"]')).not.toContainText('Reviving');
});
