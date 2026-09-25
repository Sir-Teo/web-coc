import { test, expect } from '@playwright/test';
import native from '../../reference/santa-trap/native.json' with { type: 'json' };

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
  test(`native Santa flight, gift impacts and reduced motion at ${viewport.width}×${viewport.height}`, async ({
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
      m.state.army = { ...emptyArmy(), pekka: 1 };
      m.state.settings.reducedMotion = false;
      m.changed();
    });
    await page.locator('.attack-btn').click();
    await expect(page.locator('[data-action="attack:37"]')).toBeEnabled();
    await page.locator('[data-action="attack:37"]').click();
    await expect(page.locator('.battle-enemy h2')).toHaveText('Goblin Picnic');
    const initial = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      scene.scene.pause();
      scene.sync();
      const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap'),
        sprite = scene.sprites.get(trap.id);
      scene.setZoom(innerWidth < 500 ? 0.95 : 1.2);
      scene.cameras.main.centerOn(sprite.x, sprite.y - (innerHeight < 500 ? 60 : 100));
      return {
        hidden: !sprite.visible,
        texture: sprite.texture.key,
        width: sprite.width,
        height: sprite.height,
        frames: sprite.texture.frameTotal - 1,
        blocked: m.deployBlocked(36.5, 29.5),
      };
    });
    expect(initial).toEqual({
      hidden: true,
      texture: 'santa-trap-0',
      width: 194,
      height: 234,
      frames: 32,
      blocked: false,
    });
    const active = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.activeTroop = 'pekka';
      const deployed = m.deploy(36.5, 29.5);
      for (let i = 0; i < 134; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap'),
        sprite = scene.sprites.get(trap.id);
      const poses = () =>
        [...scene.santaPresentation.meshes].map(([key, mesh]) => ({
          key,
          texture: mesh.texture.key,
          vertices: mesh.vertices,
          alpha: mesh.alpha,
        }));
      const before = poses();
      scene.drawOverlay(999999);
      return {
        deployed,
        hp: m.battle.units[0].hp,
        frame: sprite.frame.name,
        alpha: sprite.alpha,
        state: m.battle.traps[trap.id],
        poses: before,
        paused: JSON.stringify(before) === JSON.stringify(poses()),
      };
    });
    expect(active).toMatchObject({
      deployed: true,
      hp: 3000,
      alpha: 1,
      paused: true,
      state: { activatedAt: 0.05, resolved: false, santa: { hits: 0 } },
    });
    expect(
      active.poses.filter((p) => p.key.includes(':sleigh-') && !p.key.includes('shadow')),
    ).toHaveLength(2);
    expect(active.poses.filter((p) => /:gift-\d/.test(p.key))).toHaveLength(4);
    expect(
      active.poses.every((p) => p.vertices.length === 16 && p.vertices.every(Number.isFinite)),
    ).toBe(true);
    await page.screenshot({
      path: `output/playtest/santa-flight-${viewport.width}-${browserName}.png`,
    });
    const impact = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      for (let i = 0; i < 26; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap');
      return {
        hp: m.battle.units[0].hp,
        hits: m.battle.traps[trap.id].santa.hits,
        meshes: scene.santaPresentation.meshes.size,
      };
    });
    expect(impact.hp).toBe(2640);
    expect(impact.hits).toBe(2);
    expect(impact.meshes).toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playtest/santa-impact-${viewport.width}-${browserName}.png`,
    });
    const reduced = await page.evaluate(() => {
      const { model: m, scene } = window.__game;
      m.state.settings.reducedMotion = true;
      scene.drawOverlay(0);
      const keys = [...scene.santaPresentation.meshes.keys()];
      for (let i = 0; i < 10; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap');
      const result = { keys, hp: m.battle.units[0].hp, state: m.battle.traps[trap.id] };
      m.finishBattle();
      scene.sync();
      scene.drawOverlay(0);
      return { ...result, cleared: scene.santaPresentation.meshes.size === 0 };
    });
    expect(reduced.keys.some((k) => k.includes('sleigh') || k.includes('debris'))).toBe(false);
    expect(reduced).toMatchObject({
      hp: 2100,
      state: { resolved: true, santa: { hits: 5 } },
      cleared: true,
    });
    expect(errors).toEqual([]);
  });

test('native Santa replay rewinds all meshes and audio without changing the home village', async ({
  page,
  browserName,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const result = await page.evaluate(async () => {
    const { santaBattle } = await import('/tests/fixtures/santa-battle.ts');
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    const { model: m, scene, audio } = window.__game;
    scene.scene.pause();
    santaBattle(m);
    for (let i = 0; i < 260; i++) m.step(0.05);
    m.finishBattle();
    const final = structuredClone(m.battle);
    const replay = parseReplayFile(JSON.stringify(makeReplayFile(m.state.raidLog[0].replay)));
    m.returnHome();
    const home = JSON.stringify(m.state);
    m.openReplay(replay);
    const seek = (time) => {
      m.seekReplay(time);
      for (let i = 0; i < 100 && m.replay.seeking; i++) m.step(0.05);
      scene.sync();
      scene.drawOverlay(0);
      const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap'),
        sprite = scene.sprites.get(trap.id);
      return {
        visible: sprite.visible,
        frame: sprite.frame.name,
        state: m.battle.traps[trap.id] ?? null,
        poses: [...scene.santaPresentation.meshes].map(([key, v]) => [key, v.vertices, v.alpha]),
      };
    };
    const start = seek(0),
      middle = seek(6.7),
      back = seek(0),
      repeated = seek(6.7);
    seek(1e6);
    const end = structuredClone(m.battle),
      cleared = scene.santaPresentation.meshes.size === 0;
    seek(6.7);
    const trap = m.battle.buildings.find((b) => b.npc === 'santa-trap'),
      sprite = scene.sprites.get(trap.id);
    scene.setZoom(1.2);
    scene.cameras.main.centerOn(sprite.x, sprite.y - 100);
    await audio.unlock();
    await Promise.all([...audio.samples.decoding].map(() => Promise.resolve()));
    return {
      start,
      middle,
      back,
      repeated,
      final,
      end,
      cleared,
      isolated: JSON.stringify(m.state) === home,
    };
  });
  expect(result.start).toMatchObject({ visible: false, state: null, poses: [] });
  expect(result.middle.poses.length).toBeGreaterThan(0);
  expect(result.back).toEqual(result.start);
  expect(result.repeated).toEqual(result.middle);
  expect(result.end).toEqual(result.final);
  expect(result).toMatchObject({ cleared: true, isolated: true });
  await page.screenshot({ path: `output/playtest/santa-replay-${browserName}.png` });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          [...window.__game.audio.samples.buffers.keys()].filter((k) => k.startsWith('santa-'))
            .length,
      ),
    )
    .toBe(4);
  const sound = await page.evaluate(async () => {
    const { model: m, audio } = window.__game;
    const { santaSoundCues } = await import('/src/game/santa-art.ts');
    const state = Object.values(m.battle.traps).find((s) => s.santa),
      cues = santaSoundCues(state, 'test');
    await audio.context.resume();
    audio.samples.sync(cues, state.santa.castAt + 0.1, 1, true);
    const names = [...audio.samples.active.keys()];
    audio.samples.sync(cues, state.santa.castAt + 0.1, 1, false);
    return { names, stopped: audio.samples.active.size === 0 };
  });
  expect(sound).toEqual({ names: ['test:call'], stopped: true });
  expect(errors).toEqual([]);
});

test('GPU sleigh pixels match the independent native Canvas compositor, including tipping shear', async ({
  page,
  browserName,
}) => {
  const report = await page.evaluate(async (reference) => {
    const { scene, game } = window.__game;
    const { santaBattle } = await import('/tests/fixtures/santa-battle.ts');
    const m = santaBattle();
    m.step(0.05);
    const state = Object.values(m.battle.traps).find((s) => s.santa);
    document.querySelector('#ui').style.display = 'none';
    scene.paused = true;
    scene.tweens.pauseAll();
    for (const child of scene.children.list) child.setVisible(false);
    scene.cameras.main.setScroll(0, 0).setZoom(1);
    const group = reference.groups.sleigh;
    const images = await Promise.all(
      group.pages.map(async (p) => {
        const im = new Image();
        im.src = '/' + p.path;
        await im.decode();
        return im;
      }),
    );
    const canvas = document.createElement('canvas');
    canvas.width = 1400;
    canvas.height = 1000;
    const ctx = canvas.getContext('2d'),
      gl = game.renderer.gl;
    const capture = () =>
      new Promise<Uint8Array>((resolve) =>
        game.events.once('postrender', () => {
          const bytes = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
          gl.readPixels(
            0,
            0,
            gl.drawingBufferWidth,
            gl.drawingBufferHeight,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            bytes,
          );
          resolve(bytes);
        }),
      );
    const results = [];
    for (const frame of [108, 114, 120]) {
      const rows = reference.tracks.sleigh.frames[frame],
        root = rows[0].matrix;
      m.battle.elapsed = state.santa.castAt + frame / 24;
      // Compare at one output pixel per atlas pixel. Browser Canvas downsampling
      // filters differ; this isolates source placement, atlas UVs and affine shear.
      scene.santaPresentation.render(m.battle, false, false, 1, () => ({
        x: 700 - root[2] * 2,
        y: 500 - root[5] * 2 + 280,
      }));
      for (const mesh of scene.santaPresentation.meshes.values())
        mesh
          .setScale(4 / 3)
          .setVisible(mesh.getData('santa') === 'sleigh-0' || mesh.getData('santa') === 'sleigh-1');
      const actual = await capture();
      for (const mesh of scene.santaPresentation.meshes.values()) mesh.setVisible(false);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const row of rows) {
        const clip = Object.values(group.clips).find((c) => c.id === row.id),
          cell = group.frames[clip.frames[row.frame]];
        const [a, c, x, b, d, y] = row.matrix;
        ctx.save();
        ctx.globalAlpha = row.multiply[3];
        ctx.setTransform(
          a * 2,
          b * 2,
          c * 2,
          d * 2,
          700 + (x - root[2]) * 2,
          500 + (y - root[5]) * 2,
        );
        ctx.drawImage(
          images[cell.page],
          (cell.cell % group.columns) * group.width,
          Math.floor(cell.cell / group.columns) * group.height,
          group.width,
          group.height,
          group.bounds[0],
          group.bounds[1],
          group.width / 2,
          group.height / 2,
        );
        ctx.restore();
      }
      const texture = scene.textures.addCanvas(`santa-reference-${frame}`, canvas, true),
        image = scene.add.image(0, 0, texture).setOrigin(0, 0);
      const expected = await capture();
      image.destroy();
      scene.textures.remove(texture.key);
      let colored = 0,
        largeError = 0,
        totalError = 0;
      for (let i = 0; i < actual.length; i += 4) {
        if (
          actual[i] !== actual[0] ||
          actual[i + 1] !== actual[1] ||
          actual[i + 2] !== actual[2] ||
          expected[i] !== expected[0] ||
          expected[i + 1] !== expected[1] ||
          expected[i + 2] !== expected[2]
        ) {
          colored++;
          const diff = Math.max(
            Math.abs(actual[i] - expected[i]),
            Math.abs(actual[i + 1] - expected[i + 1]),
            Math.abs(actual[i + 2] - expected[i + 2]),
          );
          totalError += diff;
          if (diff > 25) largeError++;
        }
      }
      results.push({
        frame,
        colored,
        largeFraction: largeError / colored,
        meanError: totalError / colored,
        glError: gl.getError(),
      });
    }
    return results;
  }, native);
  console.log('Santa native pixel comparison', browserName, report);
  for (const r of report) {
    expect(r.colored).toBeGreaterThan(10000);
    expect(r.glError).toBe(0);
    expect(r.largeFraction).toBeLessThan(0.001);
    expect(r.meanError).toBeLessThan(1);
  }
});
