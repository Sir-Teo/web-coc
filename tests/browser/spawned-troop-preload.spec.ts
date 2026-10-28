import { expect, test } from '@playwright/test';
import { attackingWitchBattle } from '../fixtures/attacking-witch';
import { attackingGolemBattle } from '../fixtures/attacking-golem';
import { attackingHoundBattle } from '../fixtures/attacking-hound';
import { deploymentLifecycleBattle } from '../fixtures/deployment-lifecycle';
import { heroPuppetBattle } from '../fixtures/hero-puppet';

for (const c of [
  { parent: 'witch', level: 8, child: 'skeleton', tier: 2, width: 390, death: false },
  { parent: 'superwitch', level: 8, child: 'bigboy', tier: 1, width: 1440, death: false },
  { parent: 'golem', level: 15, child: 'golemite', tier: 15, width: 390, death: true },
  { parent: 'lavahound', level: 8, child: 'lavapup', tier: 1, width: 1440, death: true },
  { parent: 'icehound', level: 8, child: 'icehoundpup', tier: 1, width: 390, death: true },
  { parent: 'druid', level: 6, child: 'bear', tier: 6, width: 1440, death: false },
  { parent: 'gwlavaloon', level: 11, child: 'gwlavaloonpup', tier: 11, width: 390, death: true },
] as const)
  test(`${c.parent} preloads ${c.child} ${c.tier} before its first appearance`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    const data =
      c.parent === 'gwlavaloon'
        ? heroPuppetBattle({
            kind: 'warden',
            level: 1,
            items: [{ slug: 'lavaloon-puppet', level: 27 }],
          }).data
        : c.parent === 'witch' || c.parent === 'superwitch'
          ? attackingWitchBattle(c.level, undefined, 11.4, c.parent === 'superwitch').data
          : c.parent === 'golem'
            ? attackingGolemBattle(c.level).data
            : c.parent === 'druid'
              ? deploymentLifecycleBattle('druid', c.level, undefined, 0).data
              : attackingHoundBattle(c.level, undefined, 11.4, c.parent === 'icehound').data;
    const errors: string[] = [],
      requests: { path: string; type: string }[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (r) =>
      requests.push({ path: new URL(r.url()).pathname, type: r.resourceType() }),
    );
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    await page.setViewportSize({ width: c.width, height: c.width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.evaluate(async (data) => {
      const { model, scene, audio } = window.__game,
        { replayBattle } = await import('/src/game/replay.ts');
      scene.paused = true;
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      model.battle = replayBattle(data.initial, data.version);
      model.changed();
      scene.sync();
      scene.drawOverlay(0);
    }, data);
    await page.waitForFunction(async ({ parent, level, child, tier }) => {
      const { scene, audio } = window.__game,
        { nativeUnitStats } = await import('/src/game/native-units.ts'),
        { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts'),
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts'),
        shot = nativeUnitStats(child, tier).projectile;
      return (
        [
          [parent, level],
          [child, tier],
        ].every(([kind, level]) =>
          scene.troopNativePresentation.levelsReady.get(kind)?.has(level),
        ) &&
        (!shot || scene.nativeProjectiles.packs.packs.has(nativeProjectilePack(shot))) &&
        troopSoundFiles(child).every((file) => audio.samples.has(troopSample(file)))
      );
    }, c);
    expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
    const warmed = requests.length;
    const result = await page.evaluate(async ({ parent, child, death }) => {
      const { model, scene } = window.__game,
        { hurtUnit } = await import('/src/game/native-status.ts'),
        { iso } = await import('/src/game/scene.ts');
      if (parent === 'gwlavaloon') {
        if (
          !model.deployNativeHero('warden', 11.4, 11.5) ||
          !model.activateNativeHeroAbility('warden')
        )
          throw Error('Lavaloon Puppet activation failed');
      } else {
        model.activeHero = false;
        model.activeHeroKind = null;
        model.activeTroop = parent;
        if (!model.deploy(11.4, 11.5)) throw Error('Summoner deployment failed');
      }
      const unit = model.battle.units.find((u) => u.kind === parent);
      if (death) hurtUnit(model.battle, unit, unit.maxHp);
      while (!model.battle.units.some((u) => u.kind === child)) {
        if (model.battle.elapsed > 35 || model.battle.finished)
          throw Error('Child appearance missing');
        model.step(0.05);
      }
      const children = model.battle.units.filter((u) => u.kind === child),
        p = iso(children[0].x, children[0].y),
        before = JSON.stringify(model.battle);
      scene.cameras.main.useBounds = false;
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.45 : 1.8).centerOn(p.x, p.y - 60);
      scene.sync();
      scene.cameras.main.preRender();
      scene.drawOverlay(0);
      return {
        tiers: children.map((u) => u.level),
        visible: children.every((u) =>
          scene.troopNativePresentation.views
            .get(u.id)
            ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
        ),
        readOnly: before === JSON.stringify(model.battle),
        gl: window.__game.game.renderer.gl.getError(),
      };
    }, c);
    expect(result.tiers.length).toBeGreaterThan(0);
    expect(new Set(result.tiers)).toEqual(new Set([c.tier]));
    expect(result.visible).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.gl).toBe(0);
    expect(
      requests
        .slice(warmed)
        .filter(
          ({ path, type }) =>
            path.includes(`/troops-native/${c.child}/`) &&
            (type === 'image' || path.endsWith('/graph.json')),
        ),
    ).toEqual([]);
    await page.screenshot({ path: `output/playtest/spawn-preload-${c.child}-${c.width}.png` });
    if (c.parent === 'golem') {
      const released = await page.evaluate(() => {
        const { model, scene } = window.__game;
        model.returnHome();
        scene.sync();
        return !scene.troopNativePresentation.packs.has('golemite');
      });
      expect(released).toBe(true);
      await page.evaluate(async (data) => {
        const { model, scene } = window.__game,
          { replayBattle } = await import('/src/game/replay.ts');
        model.battle = replayBattle(data.initial, data.version);
        model.changed();
        scene.sync();
      }, data);
      await page.waitForFunction(() =>
        window.__game.scene.troopNativePresentation.levelsReady.get('golemite')?.has(15),
      );
      expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
    }
    expect(errors).toEqual([]);
  });
