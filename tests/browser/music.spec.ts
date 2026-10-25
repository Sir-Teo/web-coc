import { test, expect } from '@playwright/test';

test('the Music switch plays the original Home theme and follows a battle', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('#loading').waitFor({ state: 'detached' });
  const track = () => page.evaluate(() => window.__game.audio.tracks.current);
  const playing = () => page.evaluate(() => window.__game.audio.tracks.playing);
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/audio/music/')) requests.push(new URL(r.url()).pathname);
  });
  // Music is off by default, and nothing is downloaded until it is turned on.
  expect(await page.evaluate(() => window.__game.model.state.settings.music)).toBe(false);
  await page.locator('[data-action="settings"]').first().click();
  const music = page.locator('.toggle[data-action="music"]');
  await expect(music).toHaveAttribute('aria-checked', 'false');
  expect(requests).toEqual([]);
  await music.click();
  await expect(music).toHaveAttribute('aria-checked', 'true');
  await expect.poll(playing).toBe(true);
  expect(await track()).toBe('assets/audio/music/home_music_part_1.ogg');
  expect(requests).toEqual(['/assets/audio/music/home_music_part_1.ogg']);
  await page.keyboard.press('Escape');
  // A practice attack scouts to the planning loop after the intro sting, then fights to combat.
  await page.evaluate(() => window.__game.model.startBattle(0, true));
  await expect.poll(track, { timeout: 15000 }).toBe('assets/audio/music/combat_planning_music.mp3');
  await expect.poll(playing).toBe(true);
  expect(requests).toContain('/assets/audio/music/new_battle_intro_01.mp3');
  await page.evaluate(() => {
    const b = window.__game.model.battle!;
    b.started = true;
    window.__game.model.changed();
  });
  await expect.poll(track).toBe('assets/audio/music/combat_music.ogg');
  await page.evaluate(() => window.__game.model.finishBattle());
  await expect.poll(track).toBe(null);
  // Turning music off pauses it.
  await page.evaluate(() => window.__game.model.returnHome());
  await expect.poll(track).toBe('assets/audio/music/home_music_part_1.ogg');
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.toggle[data-action="music"]').click();
  await expect.poll(playing).toBe(false);
});

test('Music off and screen changes cancel active stings while sound effects stay enabled', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.toggle[data-action="music"]').click();
  await page.keyboard.press('Escape');
  await page.evaluate(() => window.__game.model.startBattle(0, true));
  await page.waitForFunction(() => window.__game.audio.tracks.voices.size === 1);
  const muted = await page.evaluate(() => {
    const { audio } = window.__game;
    const voice = [...audio.tracks.voices][0];
    audio.music(false);
    return {
      voices: audio.tracks.voices.size,
      completionCancelled: voice.source.onended === null,
      sound: audio.enabled,
      context: audio.context.state,
    };
  });
  expect(muted).toEqual({ voices: 0, completionCancelled: true, sound: true, context: 'running' });
  await page.evaluate(() => window.__game.audio.music(true));
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  await page.evaluate(() => window.__game.model.finishBattle());
  await page.waitForFunction(() => window.__game.audio.tracks.voices.size === 1);
  await page.evaluate(() => window.__game.model.returnHome());
  expect(await page.evaluate(() => window.__game.audio.tracks.voices.size)).toBe(0);
  await expect
    .poll(() => page.evaluate(() => window.__game.audio.tracks.current))
    .toContain('home_music_part_1');
});

for (const destination of ['home', 'combat'] as const) {
  test(`A delayed battle intro stays silent after leaving for ${destination}`, async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let requested = false;
    await page.route('**/assets/audio/music/new_battle_intro_01.mp3', async (route) => {
      requested = true;
      await held;
      await route.continue();
    });
    await page.goto('/');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('[data-action="settings"]').first().click();
    await page.locator('.toggle[data-action="music"]').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.__game.model.startBattle(0, true));
    await expect.poll(() => requested).toBe(true);
    await page.evaluate((destination) => {
      const { model } = window.__game;
      if (destination === 'home') model.returnHome();
      else {
        model.battle.started = true;
        model.changed();
      }
    }, destination);
    release();
    await page.evaluate(async () => {
      await Promise.all([...window.__game.audio.tracks.stings.values()]);
    });
    expect(await page.evaluate(() => window.__game.audio.tracks.voices.size)).toBe(0);
    await expect
      .poll(() => page.evaluate(() => window.__game.audio.tracks.current))
      .toContain(destination === 'home' ? 'home_music_part_1' : 'combat_music');
    await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  });
}

test('Sound effects off cancels interface samples and tones while music keeps playing', async ({
  page,
}) => {
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('.toggle[data-action="music"]').click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  const muted = await page.evaluate(() => {
    const { audio, model } = window.__game;
    const ctx = audio.context;
    // A real long Web Audio buffer keeps an interface source active during the switch.
    audio.samples.buffers.set(
      'mute-check',
      ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate),
    );
    if (!audio.samples.shot('mute-check', 1)) throw Error('Interface sample did not start');
    const shot = [...audio.samples.shots.keys()].at(-1);
    audio.tone('victory');
    const tone = [...audio.tones.keys()].at(-1);
    document.querySelector('[data-action="sound"]').click();
    return {
      sound: model.state.settings.sound,
      shots: audio.samples.shots.size,
      tones: audio.tones.size,
      completionCancelled: shot.onended === null && tone.onended === null,
      context: ctx.state,
      music: audio.tracks.playing,
    };
  });
  expect(muted).toEqual({
    sound: false,
    shots: 0,
    tones: 0,
    completionCancelled: true,
    context: 'running',
    music: true,
  });
  const sound = page.locator('.toggle[data-action="sound"]');
  await expect(sound).toHaveAttribute('aria-checked', 'false');
  await sound.click();
  await expect(sound).toHaveAttribute('aria-checked', 'true');
  expect(
    await page.evaluate(() => {
      const { audio } = window.__game;
      audio.play('deploy');
      return audio.tones.size;
    }),
  ).toBeGreaterThan(0);
});
