import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const native = JSON.parse(readFileSync('reference/pumpkin-bomb/native.json', 'utf8'));

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('#loading').waitFor({ state: 'detached' });
  await page.locator('[data-action="skip-tutorial"]').click();
});

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
])
  test(`native Rat Valley Pumpkin Bomb reveals, animates and resolves at ${viewport.width}`, async ({
    page,
    browserName,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setViewportSize(viewport);
    await page.evaluate(async () => {
      const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
      const { emptyArmy } = await import('/src/game/army.ts');
      const m = window.__game.model;
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.state.army = { ...emptyArmy(), giant: 1 };
      m.state.settings.reducedMotion = false;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    for (const index of [9, 10, 19, 32])
      await expect(page.locator(`[data-action="attack:${index}"]`)).toBeEnabled();
    await page.locator('[data-action="attack:9"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Rat Valley');
    const initial = await page.evaluate(async () => {
      const { model: m, scene } = window.__game;
      scene.scene.pause();
      scene.sync();
      const trap = m.battle.buildings.find((b) => b.npc === 'pumpkin-bomb'),
        sprite = scene.sprites.get(trap.id);
      const image = sprite.texture.getSourceImage(),
        canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      canvas.getContext('2d').drawImage(image, 0, 0);
      const bytes = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      // Canvas may round low-alpha RGB during unpremultiplication; verify the alpha channel exactly.
      const alpha = new Uint8Array(bytes.length / 4);
      for (let i = 0; i < alpha.length; i++) alpha[i] = bytes[i * 4 + 3];
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', alpha))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      scene.setZoom(1.2);
      scene.cameras.main.centerOn(sprite.x, sprite.y - (innerHeight < 500 ? 30 : 0));
      return {
        hidden: !sprite.visible,
        texture: sprite.texture.key,
        frame: sprite.frame.name,
        width: sprite.width,
        height: sprite.height,
        frames: sprite.texture.frameTotal - 1,
        alpha: hash,
        point: [sprite.x, sprite.y],
        blocked: m.deployBlocked(35, 9.5),
      };
    });
    expect(initial).toMatchObject({
      hidden: true,
      texture: 'pumpkin-bomb-native',
      frame: 0,
      width: 130,
      height: 152,
      frames: 45,
      blocked: false,
    });
    // Hash is computed independently from the committed PNG by Node's image decoder.
    const { default: sharp } = await import('sharp');
    const { createHash } = await import('node:crypto');
    const alpha = await sharp(`public/${native.atlas.path}`)
      .extractChannel('alpha')
      .raw()
      .toBuffer();
    expect(initial.alpha).toBe(createHash('sha256').update(alpha).digest('hex'));
    const active = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.activeTroop = 'giant';
      const deployed = m.deploy(35, 9.5);
      for (let i = 0; i < 21; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'pumpkin-bomb'),
        sprite = scene.sprites.get(trap.id);
      const pose = [sprite.x, sprite.y, sprite.frame.name];
      scene.drawOverlay(999999);
      return {
        deployed,
        visible: sprite.visible,
        frame: sprite.frame.name,
        pose,
        paused: JSON.stringify(pose) === JSON.stringify([sprite.x, sprite.y, sprite.frame.name]),
        alpha: sprite.alpha,
        hp: m.battle.units[0].hp,
        maxHp: m.battle.units[0].maxHp,
        state: m.battle.traps[trap.id],
      };
    });
    expect(active).toMatchObject({
      deployed: true,
      visible: true,
      frame: 25,
      alpha: 1,
      paused: true,
      state: { activatedAt: 0.05, resolved: false },
    });
    expect(active.pose.slice(0, 2)).toEqual(initial.point);
    expect(active.hp).toBe(active.maxHp);
    await page.screenshot({
      path: `output/playtest/pumpkin-native-${viewport.width}-${browserName}.png`,
      animations: 'disabled',
    });
    const spent = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      const trap = m.battle.buildings.find((b) => b.npc === 'pumpkin-bomb');
      m.state.settings.reducedMotion = true;
      scene.drawOverlay(0);
      const reduced = scene.sprites.get(trap.id).frame.name;
      for (let i = 0; i < 21; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const sprite = scene.sprites.get(trap.id);
      return {
        reduced,
        frame: sprite.frame.name,
        alpha: sprite.alpha,
        resolved: m.battle.traps[trap.id].resolved,
        damage: m.battle.units[0].maxHp - m.battle.units[0].hp,
      };
    });
    expect(spent).toEqual({ reduced: 44, frame: 0, alpha: 0.35, resolved: true, damage: 25 });
    expect(errors).toEqual([]);
  });

test('shared Pumpkin replay seeks restore concealment, fuse frame and spent state', async ({
  page,
  browserName,
}) => {
  const result = await page.evaluate(async () => {
    const { pumpkinBattle } = await import('/tests/fixtures/pumpkin-battle.ts');
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    const { model: m, scene } = window.__game;
    scene.scene.pause();
    pumpkinBattle(m);
    for (let i = 0; i < 80; i++) m.step(0.05);
    m.finishBattle();
    const replay = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay)));
    m.returnHome();
    const home = JSON.stringify(m.state);
    m.openReplay(replay);
    const seek = (time) => {
      m.seekReplay(time);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'pumpkin-bomb'),
        sprite = scene.sprites.get(trap.id);
      return {
        visible: sprite.visible,
        frame: sprite.frame.name,
        alpha: sprite.alpha,
        state: m.battle.traps[trap.id] ?? null,
      };
    };
    const start = seek(0),
      middle = seek(1.05),
      end = seek(4),
      back = seek(0),
      repeated = seek(1.05);
    const trap = m.battle.buildings.find((b) => b.npc === 'pumpkin-bomb'),
      sprite = scene.sprites.get(trap.id);
    scene.setZoom(1.2);
    scene.cameras.main.centerOn(sprite.x, sprite.y);
    return { start, middle, end, back, repeated, isolated: JSON.stringify(m.state) === home };
  });
  expect(result.start).toMatchObject({ visible: false, frame: 0, state: null });
  expect(result.middle).toMatchObject({ visible: true, frame: 25, state: { resolved: false } });
  expect(result.end).toMatchObject({
    visible: true,
    frame: 0,
    alpha: 0.35,
    state: { resolved: true },
  });
  expect(result.back).toEqual(result.start);
  expect(result.repeated).toEqual(result.middle);
  expect(result.isolated).toBe(true);
  await page.screenshot({ path: `output/playtest/pumpkin-replay-${browserName}.png` });
});
