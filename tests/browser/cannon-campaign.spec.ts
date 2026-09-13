import { test, expect } from '@playwright/test';

for (const width of [1440, 390])
  test(`High Pressure retains its prerequisite, four original Cannons and natural replay at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.clock.setFixedTime(new Date('2026-09-13T12:00:00Z'));
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async () => {
      const { highPressureVillage } = await import('/tests/fixtures/high-pressure-battle.ts');
      const { model: m, scene } = window.__game;
      scene.paused = true;
      m.state = highPressureVillage();
      m.state.nativeCampaign.stars[54] = 0;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('[data-action="attack:55"]')).toBeDisabled();
    await expect(page.locator('[data-action="attack:55"]')).not.toHaveText('Coming soon');
    await expect(page.locator('[data-action="attack:56"]')).toHaveText('Coming soon');
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await page.evaluate(() => {
      const m = window.__game.model;
      m.state.nativeCampaign.stars[54] = 1;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('[data-action="attack:55"]')).toBeEnabled();
    await page.locator('[data-action="attack:55"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('High Pressure');
    const active = await page.evaluate(async () => {
      const { deployHighPressure } = await import('/tests/fixtures/high-pressure-battle.ts');
      const { model: m, scene } = window.__game;
      deployHighPressure(m);
      for (let i = 0; i < 100; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay();
      window.__highPressureActive = structuredClone(m.battle);
      return {
        towers: [...scene.cannonPresentation.towers.values()].map((v) =>
          v.objects[0].getData('nativeCannon'),
        ),
        fired: Object.values(m.battle.cannons).map((h) => h.fired),
        gl: scene.game.renderer.gl.getError(),
      };
    });
    expect(active.towers).toHaveLength(4);
    expect(active.towers.every((t) => t.level === 15 && t.state === 'setup')).toBe(true);
    expect(active.fired).toHaveLength(4);
    expect(active.fired.every((n) => n > 0)).toBe(true);
    expect(active.gl).toBe(0);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    await page.screenshot({
      path: `output/playtest/cannon-high-pressure-${width}-${browserName}.png`,
    });
    const final = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 6000 && !m.battle.finished; i++) m.step(0.05);
      if (!m.battle.finished) throw Error('High Pressure did not finish');
      window.__highPressureFinal = structuredClone(m.battle);
      m.returnHome();
      window.__highPressureHome = structuredClone(m.state);
      m.startReplay(m.state.raidLog[0].id);
      const seek = (at) => {
        m.seekReplay(at);
        while (m.replay.seeking) m.step(0.05);
        return JSON.stringify(m.battle);
      };
      const same = seek(5) === JSON.stringify(window.__highPressureActive);
      const complete = seek(9999) === JSON.stringify(window.__highPressureFinal);
      m.returnHome();
      scene.sync();
      scene.drawOverlay();
      return {
        same,
        complete,
        home: JSON.stringify(m.state) === JSON.stringify(window.__highPressureHome),
      };
    });
    expect(final).toEqual({ same: true, complete: true, home: true });
    expect(errors).toEqual([]);
  });

test('the Cannon Info card enforces the original Town Hall two requirement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('[data-action="skip-tutorial"]').click();
  const id = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    scene.paused = true;
    m.townhall.level = 1;
    m.state.gold = 10000;
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon');
    m.selected = cannon.id;
    m.changed();
    return cannon.id;
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-upgrade')).toContainText('Town Hall 2');
  await expect(page.locator(`.info-upgrade [data-action="upgrade:${id}"]`)).toHaveCount(0);
  await page.evaluate(() => {
    const m = window.__game.model;
    m.townhall.level = 2;
    m.changed();
  });
  await expect(page.locator(`.info-upgrade [data-action="upgrade:${id}"]`)).toBeEnabled();
});
