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
