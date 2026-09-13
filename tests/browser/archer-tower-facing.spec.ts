import { expect, test } from '@playwright/test';
for (const action of ['idle', 'attack'] as const)
  test(`rooftop archers track targets using original ${action} meshes`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 900, height: 950 });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.ready);
    await page.locator('#loading').waitFor({ state: 'detached' });
    const report = await page.evaluate(async (action) => {
      const { scene, game } = window.__game;
      const { archerTowerBattle } = await import('/tests/fixtures/archer-tower-battle.ts');
      const { villageArcherTowerPoses } = await import('/src/game/archer-tower-scene.ts');
      const { NativeSceneView } = await import('/src/game/native-scene-view.ts');
      const model = archerTowerBattle();
      scene.model = model;
      scene.paused = true;
      scene.tweens.pauseAll();
      document.querySelector<HTMLElement>('#ui')!.style.display = 'none';
      const battle = model.battle;
      const tower = battle.buildings.find((b) => b.kind === 'archertower');
      const target = battle.units[0];
      battle.buildings = [tower];
      battle.units = [target];
      battle.projectiles = [];
      battle.defenseTargets[tower.id] = target.id;
      const directions = [
        [-1, -3, 1, false],
        [-3, -1, 1, true],
        [3, -3, 2, false],
        [-3, 3, 2, true],
        [3, 1, 3, false],
        [1, 3, 3, true],
      ];
      const recordShot = () => {
        if (action === 'attack')
          battle.archerTowerShots = {
            [tower.id]: { at: battle.elapsed, x: target.x, y: target.y },
          };
      };
      let live = 0;
      for (const reduced of [false, true]) {
        model.state.settings.reducedMotion = reduced;
        for (const [dx, dy, direction, flip] of directions) {
          target.x = tower.x + 1.5 + Number(dx);
          target.y = tower.y + 1.5 + Number(dy);
          recordShot();
          scene.sync();
          scene.drawOverlay(128);
          const objects = scene.villageArcherTowers.views.get(tower.id).resident.objects;
          if (
            !objects.length ||
            objects.some((object) => {
              const pose = object.getData('nativeTowerArcher');
              return (
                pose.direction !== direction ||
                pose.flip !== flip ||
                pose.action !== (reduced ? 'idle' : action)
              );
            })
          )
            throw Error('Live resident facing mismatch');
          live++;
        }
      }
      for (const child of scene.children.list) child.setVisible(false);
      scene.cameras.main.setScroll(0, 0).setZoom(1).setBackgroundColor('#304135');
      let cells = 0;
      for (const [row, level] of [1, 5, 8, 11, 13, 16, 19, 20, 21].entries()) {
        tower.level = level;
        for (const [column, [dx, dy, direction, flip]] of directions.entries()) {
          target.x = tower.x + 1.5 + Number(dx);
          target.y = tower.y + 1.5 + Number(dy);
          recordShot();
          const poses = villageArcherTowerPoses(tower, 0.25, battle);
          const x = column * 295 + 145,
            y = row * 205 + 190;
          scene.add.text(
            x - 100,
            y - 190,
            `${level}: view ${direction} ${flip ? 'left' : 'right'}`,
            {
              fontSize: '18px',
            },
          );
          new NativeSceneView(scene, 'archer-tower-body').render(poses.body, x, y, 0);
          new NativeSceneView(scene, 'archer-tower-resident').render(poses.residents, x, y, 1);
          cells++;
        }
      }
      await new Promise((resolve) => game.events.once('postrender', resolve));
      return { live, cells, gl: game.renderer.gl.getError() };
    }, action);
    expect(report).toEqual({ live: 12, cells: 54, gl: 0 });
    await page.screenshot({
      path: `output/playtest/archer-tower-${action}-facing-${browserName}.png`,
    });
  });
