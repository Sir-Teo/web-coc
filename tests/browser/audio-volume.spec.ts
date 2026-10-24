import { expect, test, type Locator } from '@playwright/test';

async function setVolume(slider: Locator, value: number) {
  await slider.evaluate(async (element: HTMLInputElement, value) => {
    element.value = String(value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, value);
}

for (const width of [390, 1440])
  test(`volume controls update live, retain dragging and survive reload/import at ${width}px`, async ({
    page,
    browserName,
  }) => {
    test.setTimeout(180000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    await page.goto('/?lazyart');
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="skip-tutorial"]').click();
    await page.locator('[data-action="settings"]').first().click();
    const effects = page.getByRole('slider', { name: 'Sound effects volume' });
    const music = page.getByRole('slider', { name: 'Music volume', exact: true });
    await expect(effects).toHaveValue('100');
    await expect(music).toHaveValue('50');
    await expect(music).toBeEnabled();
    await page.getByRole('switch', { name: 'Music', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
    await setVolume(music, 25);
    await expect(music).toHaveAttribute('aria-valuetext', '25 percent');
    await expect(page.locator('#music-volume-value')).toHaveText('25%');
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio.tracks as any).gain.gain.value))
      .toBeCloseTo(0.25, 2);
    expect(await page.evaluate(() => !!(window.__game.audio.tracks as any).stream)).toBe(true);
    expect(await page.evaluate(() => (window.__game.audio.tracks as any).el.volume)).toBe(1);
    await setVolume(effects, 60);
    await effects.focus();
    await page.evaluate(() => {
      (window as any).__heldVolume = document.getElementById('effects-volume');
    });
    const box = (await effects.boundingBox())!;
    const thumb = box.x + 8 + (box.width - 16) * 0.6;
    await page.mouse.move(thumb, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 8 + (box.width - 16) * 0.35, box.y + box.height / 2, {
      steps: 4,
    });
    await page.evaluate(async () => {
      window.__game.model.changed();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    });
    expect(
      await page.evaluate(
        () => (window as any).__heldVolume === document.getElementById('effects-volume'),
      ),
    ).toBe(true);
    const held = Number(await effects.inputValue());
    expect(held).toBeGreaterThan(0);
    expect(held).toBeLessThan(60);
    expect(await page.evaluate(() => window.__game.model.state.settings.effectsVolume)).toBe(
      held / 100,
    );
    await page.mouse.up();
    await expect(effects).toBeFocused();
    await page.keyboard.press('Home');
    await expect(effects).toHaveValue('0');
    // Idle nodes can leave AudioParam.value stale until they process a voice.
    await page.evaluate(() => window.__game.audio.play('victory'));
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio as any).effectsGain.gain.value))
      .toBeCloseTo(0, 2);
    await page.keyboard.press('End');
    await expect(effects).toHaveValue('100');
    await page.keyboard.press('ArrowLeft');
    await expect(effects).toHaveValue('99');
    await setVolume(effects, 37);
    const backup = await page.evaluate(() => JSON.stringify(window.__game.model.state));
    await page.getByRole('switch', { name: 'Sound effects' }).click();
    await expect(effects).toBeEnabled();
    await setVolume(effects, 0);
    await page.getByRole('switch', { name: 'Music', exact: true }).click();
    await setVolume(music, 75);
    await expect(music.locator('..')).toContainText('Muted');
    await expect(music).toHaveAttribute('aria-valuetext', '75 percent, muted');
    expect(await page.evaluate(() => window.__game.audio.tracks.playing)).toBe(false);
    await page.getByRole('switch', { name: 'Music', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__game.audio.tracks.playing)).toBe(true);
    // Let the output process after unmuting instead of accepting an idle AudioParam value.
    await page.waitForTimeout(100);
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio.tracks as any).gain.gain.value))
      .toBeCloseTo(0.75, 2);
    await page.evaluate(async () => {
      const { saveGame } = await import('/src/game/save.ts');
      if (!(await saveGame(window.__game.model.state)))
        throw Error('Could not save volume preferences');
    });
    await page.reload();
    await page.waitForFunction(() => window.__game?.scene.artSettled);
    await page.locator('[data-action="settings"]').first().click();
    await expect(effects).toHaveValue('0');
    await expect(music).toHaveValue('75');
    expect(
      await page.evaluate(() => [
        window.__game.audio.effectsVolume,
        window.__game.audio.musicVolume,
      ]),
    ).toEqual([0, 0.75]);
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio.tracks as any).gain.gain.value))
      .toBeCloseTo(0.75, 2);
    await page.locator('#import-file').setInputFiles({
      name: 'audio-volume-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(backup),
    });
    await page.locator('[data-action="import-confirm"]').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.locator('[data-action="settings"]').first().click();
    await expect(effects).toHaveValue('37');
    await expect(music).toHaveValue('25');
    expect(
      await page.evaluate(() => [
        window.__game.audio.effectsVolume,
        window.__game.audio.musicVolume,
      ]),
    ).toEqual([0.37, 0.25]);
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio as any).effectsGain.gain.value))
      .toBeCloseTo(0.37, 2);
    await expect
      .poll(() => page.evaluate(() => (window.__game.audio.tracks as any).gain.gain.value))
      .toBeCloseTo(0.25, 2);
    if (width === 390) {
      for (const [w, h] of [
        [320, 480],
        [568, 320],
        [700, 390],
        [701, 390],
        [390, 844],
      ]) {
        await page.setViewportSize({ width: w, height: h });
        for (const slider of [effects, music]) {
          await slider.scrollIntoViewIfNeeded();
          const issues = await slider.evaluate((el) => {
            const r = el.getBoundingClientRect(),
              body = document.querySelector('.settings-body');
            const failures = [];
            if (r.width < 44 || r.height < 44) failures.push('small hit target');
            if (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom > innerHeight)
              failures.push('outside viewport');
            if (body.scrollWidth > body.clientWidth + 1) failures.push('horizontal overflow');
            if (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) !== el)
              failures.push('obscured');
            return failures;
          });
          expect(issues, `${w}x${h}`).toEqual([]);
        }
      }
    }
    await page.locator('.settings-body').evaluate((el) => el.scrollTo(0, 0));
    await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
    await page.screenshot({ path: `output/playtest/audio-volume-${width}-${browserName}.png` });
    expect(errors).toEqual([]);
  });
