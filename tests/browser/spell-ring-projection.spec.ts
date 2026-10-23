import { expect, test } from '@playwright/test';

for (const scenario of ['native', 'legacy', 'guide'] as const)
  for (const width of [1440, 390]) {
    test(`${scenario} ring follows its projected world radius at ${width}px`, async ({
      page,
      browserName,
    }) => {
      await page.setViewportSize({ width, height: width === 1440 ? 960 : 844 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/?lazyart');
      await page.waitForFunction(() => window.__game?.scene.artSettled);
      await page.locator('[data-action="skip-tutorial"]').click();
      const report = await page.evaluate(async (scenario) => {
        const { makeBuilding } = await import('/src/game/model.ts');
        const { emptyArmy, emptySpells, defaultSpellLevels } = await import('/src/game/army.ts');
        const { iso } = await import('/src/game/scene.ts');
        const { model, scene } = window.__game;
        model.state.obstacles = [];
        model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, scenario === 'guide' ? 4 : 8)];
        model.state.nextId = 100;
        model.state.king = undefined;
        model.state.army = { ...emptyArmy(), giant: 1 };
        model.state.spells = { ...emptySpells(), poison: 1, rage: 1 };
        model.state.spellLevels = { ...defaultSpellLevels(), poison: 1, rage: 1 };
        model.state.settings.reducedMotion = true;
        let x = 20,
          y = 20,
          radius = 4;
        if (scenario === 'guide') {
          model.clearArmy();
          model.startCampaign(90, true);
          const spot = model.practiceGuide.spot;
          if (!spot || !model.guideStep.unit) throw Error('Practice deployment spot missing');
          x = spot.x;
          y = spot.y;
          radius = Math.max(0.8, model.guideStep.radius);
        } else {
          model.startBattle(0, true);
          if (scenario === 'legacy') {
            const { useReleasedCombat } = await import('/tests/fixtures/released-combat.ts');
            useReleasedCombat(model);
            model.activeSpell = 'rage';
            radius = model.spellStats('rage').radius;
          } else model.activeSpell = 'poison';
          if (!model.castSpell(x, y)) throw Error('Spell cast failed');
          for (let i = 0; i < 40; i++) model.step(0.05);
        }
        scene.paused = true;
        model.changed();
        scene.sync();
        const center = iso(x, y);
        scene.cameras.main.setZoom(innerWidth === 390 ? 1 : 1.5).centerOn(center.x, center.y - 30);
        scene.drawOverlay(0);
        const shapes: { x: number; y: number; w: number; h: number }[] = [];
        const fills: { x: number; y: number; w: number; h: number }[] = [];
        const original = scene.overlay.strokeEllipse;
        const originalFill = scene.auraFills.put;
        scene.overlay.strokeEllipse = function (x, y, w, h) {
          shapes.push({ x, y, w, h });
          return original.call(this, x, y, w, h);
        };
        scene.auraFills.put = function (shape, x, y, scaleX, scaleY, ...args) {
          fills.push({ x, y, w: scaleX * 64, h: scaleY * 32 });
          return originalFill.call(this, shape, x, y, scaleX, scaleY, ...args);
        };
        try {
          scene.drawAuras(model.battle);
        } finally {
          scene.overlay.strokeEllipse = original;
          scene.auraFills.put = originalFill;
        }
        const shape = shapes.find((shape) => shape.x === center.x && shape.y === center.y);
        const fill = fills.find((fill) => fill.x === center.x && fill.y === center.y);
        if (!shape || !fill) throw Error('Projected ring missing');
        return {
          shape,
          fill,
          boundaries: Array.from({ length: 8 }, (_, i) => {
            const angle = (i * Math.PI) / 4;
            const edge = iso(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
            return (
              ((edge.x - center.x) / (shape.w / 2)) ** 2 +
              ((edge.y - center.y) / (shape.h / 2)) ** 2
            );
          }),
        };
      }, scenario);
      await page.screenshot({
        path: `output/playtest/spell-ring-${scenario}-${width}-${browserName}.png`,
      });
      for (const boundary of report.boundaries) expect(boundary).toBeCloseTo(1, 6);
      expect(report.fill.w).toBeCloseTo(report.shape.w, 6);
      expect(report.fill.h).toBeCloseTo(report.shape.h, 6);
      expect(errors).toEqual([]);
    });
  }
