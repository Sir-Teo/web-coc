import { expect, test } from '@playwright/test';
import source from '../../reference/builder-hut/combat.json' with { type: 'json' };

for (const width of [1440, 390]) {
  test(`Builder's Hut higher tiers upgrade, render and survive reload at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const id = await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { model } = window.__game;
      model.state.obstacles = [];
      model.townhall!.level = 14;
      const hut = makeBuilding(model.state.nextId++, 'builder', 24, 14, 4);
      model.state.buildings.push(hut);
      model.selected = hut.id;
      model.changed();
      return hut.id;
    });
    for (const level of [5, 6, 7, 8]) {
      await page.evaluate(
        async ({ id, level }) => {
          const { model, scene } = window.__game;
          const hut = model.state.buildings.find((b) => b.id === id)!;
          model.state.gold = 500_000_000;
          model.upgrade(id);
          if (hut.upgradeEnd !== undefined) throw Error('Hut bypassed its Town Hall requirement');
          model.townhall!.level = level + 10;
          model.upgrade(id);
          if (hut.upgradeEnd === undefined) throw Error('Hut upgrade did not start');
          model.tick(hut.upgradeEnd);
          if (hut.level !== level) throw Error('Wrong completed hut level');
          model.selected = id;
          model.changed();
          scene.sync();
          await scene.prefetchDeferredArt([hut]);
          scene.sync();
          const { iso } = await import('/src/game/scene.ts');
          const point = iso(25, 15);
          scene.cameras.main.centerOn(point.x, point.y - 30);
        },
        { id, level },
      );
      const portrait = `/assets/buildings/builder-hut-native/level-${level}.png`;
      await expect(page.locator('.building-context .context-art')).toHaveAttribute('src', portrait);
      await page
        .locator('.building-context .context-art')
        .evaluate(async (image: HTMLImageElement) => image.decode());
      await expect
        .poll(() =>
          page.evaluate(
            (id) =>
              window.__game.scene.children.list.filter(
                (o) => o.visible && o.getData?.('nativeVillage') === id,
              ).length,
            id,
          ),
        )
        .toBeGreaterThan(0);
      await page
        .locator('.building-context')
        .getByRole('button', { name: 'Info', exact: true })
        .click();
      await expect(page.locator('.info-hero img')).toHaveAttribute('src', portrait);
      await page.keyboard.press('Escape');
      await page
        .locator('.building-context')
        .getByRole('button', { name: 'Move', exact: true })
        .click();
      await page.mouse.move(width * 0.3, 350);
      await expect
        .poll(() => page.evaluate(() => window.__game.scene.ghost?.texture.key))
        .toBe(`builder-hut-native-${level}`);
      const dimensions = await page.evaluate(() => {
        const im = window.__game.scene.ghost;
        return [im.displayWidth, im.displayHeight, im.originX, im.originY];
      });
      const [left, top, right, bottom] = source.previews[String(level)].bounds;
      expect(dimensions[0]).toBeCloseTo((right - left) * source.worldScale);
      expect(dimensions[1]).toBeCloseTo((bottom - top) * source.worldScale);
      expect(dimensions[2]).toBeCloseTo(-left / (right - left));
      expect(dimensions[3]).toBeCloseTo((40 - top) / (bottom - top));
      if (level === 8)
        await page.screenshot({
          path: `output/playtest/builder-hut-eight-move-${width}-${browserName}.png`,
        });
      await page.getByRole('button', { name: 'Cancel placement', exact: true }).click();
    }
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    expect(
      await page.evaluate(
        (id) => window.__game.model.state.buildings.find((b) => b.id === id)?.level,
        id,
      ),
    ).toBe(8);
    await expect
      .poll(() =>
        page.evaluate(
          (id) =>
            window.__game.scene.children.list.filter(
              (o) => o.visible && o.getData?.('nativeVillage') === id,
            ).length,
          id,
        ),
      )
      .toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });
}

for (const width of [1440, 390]) {
  test(`higher Builder's Huts wake, fire native nails and reconstruct on replay at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('Skipped drawing')) errors.push(message.text());
    });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(() => window.__game.scene.loadLateAssets());
    await page.waitForFunction(() => window.__game.scene.lateAssetsReady);
    await page.evaluate(async () => {
      const { makeBuilding } = await import('/src/game/model.ts');
      const { emptyArmy, emptySpells } = await import('/src/game/army.ts');
      const { model, scene } = window.__game;
      scene.paused = true;
      model.state.obstacles = [];
      model.state.buildings = [
        makeBuilding(1, 'townhall', 36, 36, 18),
        ...[5, 6, 7, 8].map((level, i) =>
          makeBuilding(i + 2, 'builder', 18 + (i % 2) * 3, 20 + Math.floor(i / 2) * 3, level),
        ),
      ];
      model.state.nextId = 20;
      model.state.army = { ...emptyArmy(), giant: 20 };
      model.state.spells = emptySpells();
      model.state.king = undefined;
      model.startBattle(0, true);
      model.activeTroop = 'giant';
      for (let i = 0; i < 20; i++) if (!model.deploy(16, 21)) throw Error('Deployment failed');
      for (let i = 0; i < 8; i++) model.step(0.05);
      const { iso } = await import('/src/game/scene.ts');
      const point = iso(20.5, 22.5);
      scene.cameras.main.setZoom(innerWidth === 390 ? 1.2 : 2).centerOn(point.x, point.y - 40);
      model.changed();
      scene.sync();
      scene.drawOverlay(model.battle.elapsed * 1000);
    });
    const poses = () =>
      page.evaluate(() => {
        const { scene, model } = window.__game;
        scene.drawOverlay(model.battle.elapsed * 1000);
        const huts = scene.lateCampaign.families.find((family) => family.bodies && family.nails);
        return [...huts.bodies.values()].flatMap((view) =>
          view.objects.flatMap((object) => {
            const data = object.visible && object.getData('builderHut');
            return data ? [data] : [];
          }),
        );
      });
    await expect
      .poll(async () =>
        [
          ...new Set(
            (await poses()).filter((pose) => pose.state === 'waking').map((pose) => pose.level),
          ),
        ].sort(),
      )
      .toEqual([5, 6, 7, 8]);
    const firing = await page.evaluate(() => {
      const { model, scene } = window.__game;
      for (let i = 0; i < 100; i++) {
        model.step(0.05);
        const flights = model.battle.late?.builderHut?.projectiles ?? [];
        if (flights.length && flights.some((p) => p.sourceId === 5)) break;
      }
      model.changed();
      scene.sync();
      scene.drawOverlay(model.battle.elapsed * 1000);
      return {
        at: model.battle.elapsed,
        shots: Object.values(model.battle.late.builderHut.huts).map((hut) => hut.fired),
        nails: scene.children.list.filter((o) => o.visible && o.getData?.('builderHutNail')).length,
        builders: model.battle.late.defendingBuilder.builders.map((builder) => builder.level),
        snapshot: JSON.stringify(model.battle),
      };
    });
    expect(firing.shots).toHaveLength(4);
    expect(firing.shots.every((shots) => shots > 0)).toBe(true);
    expect(firing.nails).toBeGreaterThan(0);
    expect(firing.builders).toEqual([4, 5, 6, 7]);
    await expect
      .poll(async () =>
        [
          ...new Set(
            (await poses()).filter((pose) => pose.state === 'active').map((pose) => pose.level),
          ),
        ].sort(),
      )
      .toEqual([5, 6, 7, 8]);
    await expect
      .poll(() =>
        page.evaluate(() => {
          const { model, scene } = window.__game;
          scene.drawOverlay(model.battle.elapsed * 1000);
          return model.battle.units.every((unit) =>
            scene.troopNativePresentation.drewUnit(unit.id),
          );
        }),
      )
      .toBe(true);
    expect(
      await page.evaluate(
        () =>
          window.__game.scene.children.list.filter(
            (object) => object.visible && [2, 3, 4, 5].includes(object.getData?.('nativeVillage')),
          ).length,
      ),
    ).toBe(0);
    await page.screenshot({
      path: `output/playtest/builder-hut-eight-firing-${width}-${browserName}.png`,
    });
    const replayed = await page.evaluate(async ({ at, snapshot }) => {
      const { model, scene } = window.__game;
      for (let i = 0; i < 120; i++) model.step(0.05);
      const repairs = model.battle.late.defendingBuilder.builders.flatMap(
        (builder) => builder.repairs,
      ).length;
      model.finishBattle();
      const data = model.state.raidLog[0].replay;
      model.returnHome();
      if (!model.openReplay(data)) throw Error('New hut replay rejected');
      for (const target of [at, 0, at]) {
        model.seekReplay(target);
        while (model.replay.seeking) model.step(0.05);
      }
      model.changed();
      scene.sync();
      scene.drawOverlay(model.battle.elapsed * 1000);
      return {
        version: data.version,
        repairs,
        same: JSON.stringify(model.battle) === snapshot,
        gl: window.__game.game.renderer.gl.getError(),
      };
    }, firing);
    expect(replayed).toMatchObject({ version: 56, same: true, gl: 0 });
    expect(replayed.repairs).toBeGreaterThan(0);
    await expect
      .poll(
        async () =>
          new Set(
            (await poses()).filter((pose) => pose.state === 'active').map((pose) => pose.level),
          ).size,
      )
      .toBe(4);
    await page.evaluate(() => {
      const { model, scene } = window.__game;
      model.returnHome();
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    });
    expect(
      await page.evaluate(
        () =>
          window.__game.scene.children.list.filter(
            (o) => o.visible && (o.getData?.('builderHutNail') || o.getData?.('defendingBuilder')),
          ).length,
      ),
    ).toBe(0);
    expect(errors).toEqual([]);
  });
}
