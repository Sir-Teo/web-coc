import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test('a Ladder touch that begins while art is loading cannot deploy when it lands', async ({
  page,
  browserName,
}, info) => {
  test.skip(browserName !== 'chromium', 'Uses Chromium touch injection');
  test.setTimeout(90000);
  await page.goto('/?lazyart');
  await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
  await page.locator('[data-action="skip-tutorial"]').tap();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const pattern = '**/src/game/late-campaign-scene.ts*';
  await page.route(pattern, async (route) => {
    await held;
    await route.continue();
  });
  const offer = await page.evaluate(async () => {
    const { nativeBuildings } = await import('/src/game/native-campaign.ts');
    const m = window.__game.model;
    m.townhall!.level = 12;
    m.state.trophies = 1399;
    for (let seed = 0; seed < 100; seed++) {
      m.state.ladderSeed = seed;
      const preview = m.ladderPreview;
      if (!nativeBuildings(preview.index).some((building) => building.kind === 'eagleartillery'))
        continue;
      m.changed();
      return preview.match;
    }
    throw Error('No Ladder offer with an Eagle Artillery');
  });
  const stock = () =>
    page.evaluate(() => {
      const { battle } = window.__game.model;
      return {
        remaining: battle!.remaining.swordsman,
        started: battle!.started,
        prep: battle!.prep,
        ladder: battle!.ladder,
      };
    });
  const cdp = await page.context().newCDPSession(page);
  try {
    await page.locator('.attack-btn').tap();
    const request = page.waitForRequest((r) => r.url().includes('/late-campaign-scene.ts'));
    await page.locator('.campaign-summary [data-action="ladder"]').tap();
    await request;
    await page.locator('[data-action="troop:swordsman"]').tap();
    expect(await page.evaluate(() => window.__game.scene.battleArtPending())).toBe(true);
    const readiness = page.locator('.prep-banner [role="status"]');
    await expect(readiness).toHaveText('Loading village art…');
    const initial = await stock();
    expect(initial).toMatchObject({ prep: 30, started: false, ladder: offer });
    const point = await page.evaluate(() => {
      const { model, scene, game } = window.__game;
      for (let y = 1.5; y < 46; y++)
        for (let x = 1.5; x < 46; x++) {
          const p = scene.screenFor(x, y);
          if (
            !model.deployBlocked(x, y) &&
            p.y > innerHeight * 0.32 &&
            p.y < innerHeight * 0.6 &&
            document.elementFromPoint(p.x, p.y) === game.canvas
          )
            return { x: p.x, y: p.y };
        }
      throw Error('No usable deployment point');
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
    await page.waitForTimeout(350);
    expect(await stock()).toEqual(initial);
    release();
    await page.waitForFunction(() => !window.__game.scene.battleArtPending());
    await expect(readiness).toHaveText('Tap a defense to see its range · Deploy to start');
    await page.waitForTimeout(450);
    const afterWait = await stock();
    expect(afterWait).toMatchObject({
      remaining: initial.remaining,
      started: false,
      ladder: offer,
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect((await stock()).remaining).toBe(initial.remaining);

    await page.touchscreen.tap(point.x, point.y);
    await expect.poll(async () => (await stock()).remaining).toBe(initial.remaining - 1);
    expect(await stock()).toMatchObject({ started: true, ladder: offer });
    await page.screenshot({ path: info.outputPath('ladder-first-deliberate-deployment.png') });
    await page.locator('[data-action="surrender"]').tap();
    await page.locator('[data-action="end"]').tap();
    const recording = await page.evaluate(() => {
      const replay = window.__game.model.state.raidLog?.[0]?.replay;
      return (
        replay && {
          stake: replay.initial.ladder,
          deployments: replay.actions.filter((action) => action.type === 'troop'),
        }
      );
    });
    expect(recording?.stake).toEqual(offer);
    expect(recording?.deployments).toMatchObject([{ kind: 'swordsman' }]);
  } finally {
    release();
    await cdp.detach();
  }
});
