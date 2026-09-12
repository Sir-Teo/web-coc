import { test, expect, type Page } from '@playwright/test';

async function capture(page: Page, path: string) {
  // Let Phaser render the manually sampled frame before the browser captures its compositor.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        window.__game.scene.game.events.once('postrender', () =>
          requestAnimationFrame(() => resolve()),
        ),
      ),
  );
  await page.screenshot({ path, animations: 'disabled' });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.ready);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

test('original mine families share correct world registration, selection, ghosts and Info', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const home = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    scene.renderClock = 0;
    m.state.obstacles = [];
    m.state.buildings = [
      makeBuilding(1, 'townhall', 25, 25, 8),
      ...[1, 3, 5, 7].map((level, i) =>
        makeBuilding(i + 2, 'seekingairmine', 6 + i * 3, 10, level),
      ),
    ];
    m.state.nextId = 6;
    m.changed();
    scene.sync();
    scene.drawOverlay(0);
    scene.setZoom(2);
    scene.cameras.main.centerOn(iso(11, 10.5).x, iso(11, 10.5).y - 25);
    scene.drawOverlay(0);
    return [1, 3, 5, 7].map((level, i) => {
      const id = i + 2,
        b = m.state.buildings.find((b) => b.id === id),
        sprite = scene.sprites.get(id),
        view = scene.seekingMinePresentation.mines.get(id),
        bounds = scene.nativeBuildingBounds(b);
      const point = { x: sprite.x, y: sprite.y + bounds[1] + 15 };
      return {
        level,
        texture: sprite.texture.key,
        alpha: sprite.alpha,
        size: [sprite.displayWidth, sprite.displayHeight],
        keys: [...view.meshes.keys()],
        picked: scene.pickBuilding(point.x, point.y, { x: -1, y: -1 })?.id,
        expected: id,
        meta: view.objects[0].getData('nativeSeekingMine'),
      };
    });
  });
  for (const row of home) {
    expect(row.texture).toBe(`seeking-mine-setup-${row.level}`);
    expect(row.alpha).toBe(0);
    expect(row.size).toEqual([83.2, 104]);
    expect(row.keys.length).toBeGreaterThan(0);
    expect(row.picked).toBe(row.expected);
    expect(row.meta).toMatchObject({ state: 'setup', level: row.level, time: 0 });
  }
  await capture(page, `output/playtest/seeking-mine-live-families-${browserName}.png`);
  const ghost = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.move(3);
    scene.sync();
    scene.updateGhost({ x: 400, y: 450 });
    return {
      texture: scene.ghost.texture.key,
      origin: [scene.ghost.originX, scene.ghost.originY],
      size: [scene.ghost.displayWidth, scene.ghost.displayHeight],
    };
  });
  expect(ghost).toEqual({
    texture: 'seeking-mine-setup-3',
    origin: [0.5, 102 / 130],
    size: [83.2, 104],
  });
  await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.cancel();
    m.selected = 4;
    m.changed();
    scene.sync();
  });
  await page.locator('[data-action="info"]').click();
  await expect(page.locator('.info-hero img')).toHaveAttribute(
    'src',
    '/assets/buildings/seeking-mine-native/info.png',
  );
  await expect(page.locator('.info-hero')).toContainText('LEVEL 5 OF 8');
  await capture(page, `output/playtest/seeking-mine-live-info-${browserName}.png`);
  expect(errors).toEqual([]);
});

test('native campaign mine emergence, trail and impact rewind exactly and respect reduced motion', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const fixture = await page.evaluate(async () => {
    const { seekingMineBattle } = await import('/tests/fixtures/seeking-mine-battle.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    const source = seekingMineBattle(52);
    for (let i = 0; i < 6000 && !source.battle.finished; i++) source.step(0.05);
    if (!source.battle.finished) throw Error('Native mine fixture did not finish');
    const entry = Object.entries(source.battle.traps).find(([, state]) => state.mine?.hit);
    if (!entry) throw Error('Native mine fixture had no impact');
    const id = Number(entry[0]),
      state = entry[1],
      mine = source.battle.buildings.find((b) => b.id === id);
    if (!m.openReplay(source.state.raidLog[0].replay))
      throw Error('Native mine replay did not open');
    const { iso } = await import('/src/game/scene.ts');
    const p = iso(mine.x + 0.5, mine.y + 0.5);
    scene.setZoom(2);
    scene.cameras.main.centerOn(p.x, p.y - 60);
    return {
      id,
      activatedAt: state.activatedAt,
      impact: state.mine.resolvedAt,
      flightAt: Math.ceil((state.activatedAt + 0.4) * 20) / 20,
      impactAt: Math.ceil(state.mine.resolvedAt * 20) / 20 + 0.05,
    };
  });
  const seek = async (time: number) =>
    page.evaluate(
      async ({ time, id }) => {
        const { model: m, scene } = window.__game;
        m.seekReplay(time);
        while (m.replay.seeking) m.step(0.05);
        if (!m.replay.paused) m.toggleReplay();
        scene.sync();
        const { iso } = await import('/src/game/scene.ts');
        const state = m.battle.traps[id];
        const mine = m.battle.buildings.find((b) => b.id === id);
        const point = state ? iso(state.x, state.y) : iso(mine.x + 0.5, mine.y + 0.5);
        scene.setZoom(3);
        scene.cameras.main.centerOn(point.x, point.y - 65);
        scene.drawOverlay(0);
        const view = scene.seekingMinePresentation;
        return {
          time: m.battle.elapsed,
          body: view.mines.get(id)?.objects.map((o) => o.getData('nativeSeekingMine')),
          flight:
            view.projectiles
              .get(id)
              ?.objects.map((o) => o.getData('nativeSeekingMineProjectile')) ?? [],
          state: structuredClone(m.battle.traps[id]),
          effects: [...view.effects.values()].flatMap((v) =>
            v.objects.map((o) => o.getData('nativeSeekingMineEffect')),
          ),
          gl: scene.game.renderer.gl.getError(),
        };
      },
      { time, id: fixture.id },
    );
  expect((await seek(0)).state).toBeUndefined();
  expect((await seek(fixture.activatedAt + 0.05)).flight).toEqual([]);
  const flight = await seek(fixture.flightAt);
  expect(flight.state.resolved).toBe(false);
  expect(flight.flight.length).toBeGreaterThan(0);
  expect(flight.flight.every((p) => p.export === 'evil_airTrap_projectile_lvl3')).toBe(true);
  expect(flight.effects.some((e) => e.emitter === 'large_airTrap_redSmoke')).toBe(true);
  await capture(page, `output/playtest/seeking-mine-live-flight-${browserName}.png`);
  const impact = await seek(fixture.impactAt);
  expect(impact.state.mine.hit).toBe(true);
  expect(impact.flight).toEqual([]);
  expect(impact.effects.some((e) => e.emitter === 'small_airTrap_Hit')).toBe(true);
  expect(impact.effects.some((e) => e.emitter === 'large_airTrap_forceUp')).toBe(true);
  await capture(page, `output/playtest/seeking-mine-live-impact-${browserName}.png`);
  expect(await seek(fixture.flightAt)).toEqual(flight);
  expect(await seek(fixture.impactAt)).toEqual(impact);
  const reduced = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    const before = JSON.stringify(m.battle);
    m.state.settings.reducedMotion = true;
    scene.sync();
    scene.drawOverlay(0);
    return {
      same: JSON.stringify(m.battle) === before,
      flights: scene.seekingMinePresentation.projectiles.size,
      shadows: scene.seekingMinePresentation.shadows.size,
      effects: scene.seekingMinePresentation.effects.size,
    };
  });
  expect(reduced).toEqual({ same: true, flights: 0, shadows: 0, effects: 0 });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.__game.audio.samples.buffers.keys()].filter((k) =>
            k.startsWith('seeking-mine-'),
          ).length,
      ),
    )
    .toBe(5);
  const ended = await page.evaluate(() => {
    const { model: m, scene } = window.__game;
    m.returnHome();
    scene.sync();
    scene.drawOverlay(0);
    const p = scene.seekingMinePresentation;
    return [
      p.mines.size,
      p.projectiles.size,
      p.shadows.size,
      p.effects.size,
      scene.game.renderer.gl.getError(),
    ];
  });
  expect(ended).toEqual([0, 0, 0, 0, 0]);
  expect(errors).toEqual([]);
  console.log('Native mine live fixture', browserName, JSON.stringify(fixture));
});

test('mine construction, upgrade and spent hatches keep original geometry without fallback rubble', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const states = await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { iso } = await import('/src/game/scene.ts');
    const { model: m, scene } = window.__game;
    scene.paused = true;
    scene.renderClock = 500;
    m.state.obstacles = [];
    const mines = [1, 3, 7].map((level, i) =>
      makeBuilding(i + 2, 'seekingairmine', 8 + i * 3, 10, level),
    );
    Object.assign(mines[0], {
      constructing: true,
      upgradeStart: m.clock,
      upgradeEnd: m.clock + 60000,
    });
    Object.assign(mines[1], { upgradeStart: m.clock, upgradeEnd: m.clock + 60000 });
    mines[2].hp = 0;
    m.state.buildings = [makeBuilding(1, 'townhall', 25, 25, 8), ...mines];
    m.state.nextId = 5;
    m.changed();
    scene.sync();
    scene.setZoom(3);
    const p = iso(11.5, 10.5);
    scene.cameras.main.centerOn(p.x, p.y - 25);
    scene.drawOverlay(0);
    return mines.map((b) => {
      const view = scene.seekingMinePresentation.mines.get(b.id);
      const sprite = scene.sprites.get(b.id);
      return {
        state: view.objects[0].getData('nativeSeekingMine').state,
        meshes: view.meshes.size,
        proxyAlpha: sprite.alpha,
        proxyTexture: sprite.texture.key,
        bounds: scene.nativeBuildingBounds(b),
        gl: scene.game.renderer.gl.getError(),
      };
    });
  });
  expect(states.map((s) => s.state)).toEqual(['constructing', 'upgrading', 'ruin']);
  for (const s of states) {
    expect(s.meshes).toBeGreaterThan(0);
    expect(s.proxyAlpha).toBe(0);
    expect(s.proxyTexture).toMatch(/^seeking-mine-setup-/);
    expect(s.bounds.every(Number.isFinite)).toBe(true);
    expect(s.gl).toBe(0);
  }
  expect(states[1].meshes).toBeGreaterThan(states[0].meshes);
  await capture(page, `output/playtest/seeking-mine-live-states-${browserName}.png`);
  expect(errors).toEqual([]);
});
