import { expect, test } from '@playwright/test';
import { nativeFrostFlakeRecording } from '../fixtures/native-frost-flake';

for (const recovery of ['cooldown', 'online'] as const)
  test(`a failed equipment sample recovers through ${recovery} while the same replay stays paused`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    let blocked = true;
    let attempts = 0;
    await page.route(
      '**/assets/audio/troops-native/ability_rc_frostflake_shoot.ogg',
      async (route) => {
        attempts++;
        if (blocked) await route.fulfill({ status: 503, body: 'temporarily unavailable sample' });
        else await route.continue();
      },
    );
    const failure = page.waitForResponse(
      (response) =>
        response.url().endsWith('/ability_rc_frostflake_shoot.ogg') && response.status() === 503,
    );
    const recording = nativeFrostFlakeRecording();
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    const before = await page.evaluate(async (r) => {
      const { model, scene, audio } = window.__game;
      const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
      audio.enabled = true;
      audio.unlock();
      await audio.context.resume();
      if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
        throw Error('Recovery replay rejected');
      model.seekReplay(r.activation);
      while (model.replay.seeking) model.step(0.05);
      model.replay.paused = true;
      scene.paused = false;
      model.changed();
      scene.sync();
      return JSON.stringify(model.battle);
    }, recording);
    await failure;
    expect(attempts).toBe(1);
    expect(
      await page.evaluate(() =>
        window.__game.audio.samples.has('troop-ability_rc_frostflake_shoot.ogg'),
      ),
    ).toBe(false);
    blocked = false;
    if (recovery === 'online') await page.evaluate(() => dispatchEvent(new Event('online')));
    // No seek, roster change, forced redraw or new battle should be necessary.
    await expect
      .poll(
        () =>
          page.evaluate(() =>
            window.__game.audio.samples.has('troop-ability_rc_frostflake_shoot.ogg'),
          ),
        { timeout: recovery === 'online' ? 3000 : 12000 },
      )
      .toBe(true);
    expect(attempts).toBe(2);
    expect(await page.evaluate(() => JSON.stringify(window.__game.model.battle))).toBe(before);
    expect(await page.evaluate(() => window.__game.model.replay.paused)).toBe(true);
    expect(await page.evaluate(() => window.__game.audio.samples.active.size)).toBe(0);
  });
