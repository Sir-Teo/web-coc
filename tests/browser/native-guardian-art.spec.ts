import { expect, test } from '@playwright/test';

for (const kind of ['longshot', 'smasher', 'logger'] as const) {
  test(`${kind} renders its original waiting, leap, attack and death bodies`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/assets/'))
        errors.push(response.url());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async (guardian) => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { iso } = await import('/src/game/scene.ts');
      const { model, scene } = window.__game;
      model.state.obstacles = [];
      model.state.buildings = [
        { ...makeBuilding(1, 'townhall', 22, 22, 18), guardian, guardianLevel: 5 },
        makeBuilding(2, 'goldmine', 2, 44, 1),
      ];
      model.state.nextId = 5000;
      model.state.army = { ...emptyArmy(), golem: 1 };
      model.state.spells = emptySpells();
      model.startBattle(0, true);
      scene.paused = true;
      model.activeTroop = 'golem';
      if (!model.deploy(46, 46)) throw Error('Could not deploy the distant attacker');
      const attacker = model.battle.units[0];
      attacker.hp = attacker.maxHp = 1e8;
      attacker.springUntil = 1e9;
      model.step(0.05);
      const defender = model.battle.defenders.find((d) => d.kind === 'guardian');
      if (!defender || defender.guardian !== guardian || defender.phase !== 'waiting')
        throw Error('Wrong initial Guardian');
      const point = iso(defender.x, defender.y);
      scene.cameras.main.setZoom(1.3).centerOn(point.x, point.y - 25);
      scene.sync();
      scene.drawOverlay(0);
      return defender.id;
    }, kind);
    const body = async (state: string) => {
      await page.waitForFunction(
        ({ id, kind, state }) => {
          const scene = window.__game.scene;
          scene.drawOverlay(0);
          const presentation = scene.heroNativePresentation;
          const sprite = presentation.sprites.get(-1 - id);
          return (
            sprite?.visible &&
            sprite.alpha > 0 &&
            sprite.texture.key.startsWith(`baked:guardians-native/${kind}/`) &&
            presentation.positions.get(-1 - id)?.state === state
          );
        },
        { id, kind, state },
        { timeout: 30000 },
      );
      return page.evaluate((id) => {
        const { scene, game } = window.__game;
        const sprite = scene.heroNativePresentation.sprites.get(-1 - id);
        return {
          texture: sprite.texture.key,
          frame: sprite.frame.name,
          width: sprite.frame.width,
          height: sprite.frame.height,
          actor: sprite.getData('nativeHero'),
          glError: game.renderer.gl.getError(),
        };
      }, id);
    };
    const waiting = await body('idle');
    expect(waiting.actor).toBe(id);
    expect(waiting.width).toBeGreaterThan(0);
    expect(waiting.height).toBeGreaterThan(0);
    expect(waiting.glError).toBe(0);
    await page.screenshot({ path: `output/playtest/guardian-${kind}-waiting-${browserName}.png` });
    expect(
      await page.evaluate(() => {
        const { model, scene } = window.__game;
        Object.assign(model.battle.units[0], { x: 24, y: 18 });
        model.step(0.1);
        scene.drawOverlay(0);
        return model.battle.defenders.find((d) => d.kind === 'guardian').phase;
      }),
    ).toBe('leaping');
    expect((await body('jump')).glError).toBe(0);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.step(0.2);
      scene.drawOverlay(0);
    });
    await page.screenshot({ path: `output/playtest/guardian-${kind}-leap-${browserName}.png` });
    const fighting = await page.evaluate(() => {
      const { model, scene } = window.__game;
      const guardian = model.battle.defenders.find((d) => d.kind === 'guardian');
      for (let i = 0; i < 200 && !guardian.attacking; i++) model.step(0.05);
      scene.drawOverlay(0);
      return { phase: guardian.phase, attacking: guardian.attacking };
    });
    expect(fighting).toEqual({ phase: 'fighting', attacking: true });
    expect((await body('attack')).glError).toBe(0);
    await page.screenshot({ path: `output/playtest/guardian-${kind}-attack-${browserName}.png` });
    await page.evaluate(async (id) => {
      const { hurtDefender } = await import('/src/game/defenders.ts');
      const { model, scene } = window.__game;
      const guardian = model.battle.defenders.find((d) => d.id === id);
      hurtDefender(model.battle, guardian, guardian.hp);
      model.step(0.05);
      scene.drawOverlay(0);
    }, id);
    expect((await body('die')).glError).toBe(0);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      for (let i = 0; i < 34; i++) model.step(0.05);
      scene.drawOverlay(0);
    });
    await expect
      .poll(() =>
        page.evaluate((id) => window.__game.scene.heroNativePresentation.sprites.has(-1 - id), id),
      )
      .toBe(false);
    expect(errors).toEqual([]);
  });
}
