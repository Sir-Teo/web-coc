import { expect, test } from '@playwright/test';

test('a saved music-only preference starts from the first keyboard gesture', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { saveGame } = await import('/src/game/save.ts');
    const m = window.__game.model;
    m.state.settings.sound = false;
    m.state.settings.music = true;
    if (!(await saveGame(m.state))) throw Error('Could not save audio preferences');
  });
  const requests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/assets/audio/music/')) requests.push(r.url());
  });
  await page.reload();
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  expect(await page.evaluate(() => window.__game.model.state.settings)).toMatchObject({
    sound: false,
    music: true,
  });
  expect(await page.evaluate(() => window.__game.audio.context)).toBe(null);
  expect(requests).toEqual([]);
  await page.keyboard.press('Shift');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__game.audio.context)).toBe(null);
  expect(requests).toEqual([]);
  await page.keyboard.press('Tab');
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  expect(await page.evaluate(() => window.__game.audio.context.state)).toBe('running');
  expect(await page.evaluate(() => window.__game.audio.enabled)).toBe(false);
  expect(requests.length).toBeGreaterThan(0);
});

test('music-only feedback resumes an interrupted context while effects remain muted', async ({
  page,
}) => {
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.getByRole('switch', { name: 'Music', exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  await page.getByRole('switch', { name: 'Sound effects' }).click();
  await page.evaluate(async () => {
    const audio = window.__game.audio,
      ctx = audio.context;
    await ctx.suspend();
    const state = Object.getOwnPropertyDescriptor(ctx, 'state');
    const resume = ctx.resume.bind(ctx),
      shot = audio.samples.shot.bind(audio.samples);
    const oscillator = ctx.createOscillator.bind(ctx);
    const restoreState = () => {
      if (state) Object.defineProperty(ctx, 'state', state);
      else delete (ctx as any).state;
    };
    const probe = { resumes: 0, shots: 0, tones: 0 };
    Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'interrupted' });
    ctx.resume = () => {
      probe.resumes++;
      restoreState();
      return resume();
    };
    audio.samples.shot = (...args: Parameters<typeof shot>) => {
      probe.shots++;
      return shot(...args);
    };
    ctx.createOscillator = () => {
      probe.tones++;
      return oscillator();
    };
    Object.assign(window, {
      __musicOnlyProbe: probe,
      __restoreMusicOnly: () => {
        restoreState();
        ctx.resume = resume;
        audio.samples.shot = shot;
        ctx.createOscillator = oscillator;
      },
    });
  });
  try {
    await page.waitForTimeout(100);
    await page.getByRole('switch', { name: 'Reduced motion' }).click();
    await expect.poll(() => page.evaluate(() => window.__game.audio.context.state)).toBe('running');
    expect(await page.evaluate(() => (window as any).__musicOnlyProbe)).toEqual({
      resumes: 1,
      shots: 0,
      tones: 0,
    });
    expect(await page.evaluate(() => window.__game.audio.enabled)).toBe(false);
    expect(await page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
  } finally {
    await page.evaluate(() => (window as any).__restoreMusicOnly());
  }
});
