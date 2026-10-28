import { expect, test } from '@playwright/test';
import { heroPuppetBattle } from '../fixtures/hero-puppet';

for (const c of [
  { hero: 'king', slug: 'barbarian-puppet', item: 18, troop: 'swordsman', level: 12, width: 390 },
  { hero: 'queen', slug: 'archer-puppet', item: 18, troop: 'archer', level: 9, width: 1440 },
  { hero: 'queen', slug: 'healer-puppet', item: 18, troop: 'healer', level: 8, width: 390 },
  {
    hero: 'champion',
    slug: 'hog-rider-puppet',
    item: 18,
    troop: 'hogrider',
    level: 12,
    width: 1440,
  },
  { hero: 'warden', slug: 'lavaloon-puppet', item: 27, troop: 'gwlavaloon', level: 11, width: 390 },
  { hero: 'prince', slug: 'henchmen-puppet', item: 18, troop: 'henchman', level: 7, width: 1440 },
] as const)
  test(`${c.slug} warms source body tier, shots and sounds before activation`, async ({ page }) => {
    test.setTimeout(120000);
    const errors: string[] = [],
      requests: { path: string; type: string }[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('response', (r) => {
      if (r.status() >= 400 && r.url().includes('/assets/')) errors.push(r.url());
    });
    page.on('request', (r) =>
      requests.push({ path: new URL(r.url()).pathname, type: r.resourceType() }),
    );
    const r = heroPuppetBattle(
      { kind: c.hero, level: 1, items: [{ slug: c.slug, level: c.item }] },
      { swordsman: 12, archer: 9, healer: 1, hogrider: 1 },
      c.troop === 'healer' ? 'healer' : undefined,
    );
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
    }, r.data);
    await page.waitForFunction(async ({ troop, level }) => {
      const { scene, audio } = window.__game,
        { nativeUnitStats } = await import('/src/game/native-units.ts'),
        { nativeProjectilePack } = await import('/src/game/native-projectile-poses.ts'),
        { troopSoundFiles, troopSample } = await import('/src/game/troop-sounds.ts'),
        shot = nativeUnitStats(troop, level).projectile;
      return (
        scene.troopNativePresentation.levelsReady.get(troop)?.has(level) &&
        (troop !== 'healer' || scene.troopNativePresentation.levelsReady.get(troop)?.has(1)) &&
        (!shot || scene.nativeProjectiles.packs.packs.has(nativeProjectilePack(shot))) &&
        troopSoundFiles(troop).every((file) => audio.samples.has(troopSample(file)))
      );
    }, c);
    expect(await page.evaluate(() => window.__game.model.battle.units)).toEqual([]);
    const afterWarm = requests.length;
    const result = await page.evaluate(async ({ hero, troop, level }) => {
      const { model, scene } = window.__game,
        { iso } = await import('/src/game/scene.ts');
      if (!model.deployNativeHero(hero, 11.4, 11.5) || !model.activateNativeHeroAbility(hero))
        throw Error('Puppet activation failed');
      const units = model.battle.units.filter((u) => u.kind === troop);
      const before = JSON.stringify(model.battle),
        p = iso(11.4, 11.5);
      scene.cameras.main.setZoom(innerWidth < 500 ? 1.45 : 1.8).centerOn(p.x, p.y - 60);
      scene.sync();
      scene.drawOverlay(0);
      return {
        levels: units.map((u) => u.level),
        visible: units.every((u) =>
          scene.troopNativePresentation.views
            .get(u.id)
            ?.view.objects.some((o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING'),
        ),
        readOnly: before === JSON.stringify(model.battle),
        gl: window.__game.game.renderer.gl.getError(),
      };
    }, c);
    expect(result.levels.length).toBeGreaterThan(0);
    expect(new Set(result.levels)).toEqual(new Set([c.level]));
    expect(result.visible).toBe(true);
    expect(result.readOnly).toBe(true);
    expect(result.gl).toBe(0);
    expect(
      requests
        .slice(afterWarm)
        .filter(
          ({ path, type }) =>
            path.includes(`/troops-native/${c.troop}/`) &&
            (type === 'image' || path.endsWith('/graph.json')),
        ),
    ).toEqual([]);
    await page.screenshot({ path: `output/playtest/puppet-preload-${c.slug}-${c.width}.png` });
    expect(errors).toEqual([]);
  });
