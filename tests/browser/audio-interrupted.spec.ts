import { expect, test } from '@playwright/test';

test('a settings gesture retries interrupted audio after an unsuccessful resume', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.evaluate(async () => {
    const ctx = window.__game.audio.context;
    await ctx.suspend();
    // Desktop engines cannot initiate a phone-call interruption. Report that state over a
    // genuinely suspended context, then let the successful retry use the browser's resume.
    const originalState = Object.getOwnPropertyDescriptor(ctx, 'state');
    const resume = ctx.resume.bind(ctx);
    const restoreState = () => {
      if (originalState) Object.defineProperty(ctx, 'state', originalState);
      else delete (ctx as any).state;
    };
    const probe = { attempts: 0 };
    Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'interrupted' });
    ctx.resume = () => {
      probe.attempts++;
      if (probe.attempts === 1) return Promise.reject(new Error('Simulated audio interruption'));
      restoreState();
      return resume();
    };
    Object.assign(window, {
      __interruptionProbe: probe,
      __restoreInterruption: () => {
        restoreState();
        ctx.resume = resume;
      },
    });
  });
  try {
    // Button clicks have a 50 ms sound throttle; each attempt is a separate feedback cue.
    await page.waitForTimeout(100);
    await page.getByRole('switch', { name: 'Reduced motion' }).click();
    expect(await page.evaluate(() => (window as any).__interruptionProbe.attempts)).toBe(1);
    expect(await page.evaluate(() => window.__game.audio.context.state)).toBe('interrupted');
    await page.waitForTimeout(100);
    await page.getByRole('switch', { name: 'Reduced motion' }).click();
    expect(await page.evaluate(() => (window as any).__interruptionProbe.attempts)).toBe(2);
    await expect.poll(() => page.evaluate(() => window.__game.audio.context.state)).toBe('running');
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => (window as any).__restoreInterruption());
  }
});

test('returning to the page starts a fresh resume while the old attempt is pending', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.locator('[data-action="settings"]').first().click();
  await page.evaluate(async () => {
    const ctx = window.__game.audio.context;
    await ctx.suspend();
    const state = Object.getOwnPropertyDescriptor(ctx, 'state');
    const hidden = Object.getOwnPropertyDescriptor(document, 'hidden');
    const resume = ctx.resume.bind(ctx);
    const restoreState = () => {
      if (state) Object.defineProperty(ctx, 'state', state);
      else delete (ctx as any).state;
    };
    const restoreHidden = () => {
      if (hidden) Object.defineProperty(document, 'hidden', hidden);
      else delete (document as any).hidden;
    };
    let release!: () => void;
    const probe = { attempts: 0 };
    Object.defineProperty(ctx, 'state', { configurable: true, get: () => 'interrupted' });
    ctx.resume = () => {
      probe.attempts++;
      if (probe.attempts === 1)
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      restoreState();
      return resume();
    };
    Object.assign(window, {
      __interruptionProbe: probe,
      __releaseInterruption: () => release?.(),
      __showInterruptionPage: () => {
        restoreHidden();
        document.dispatchEvent(new Event('visibilitychange'));
      },
      __restoreInterruption: () => {
        restoreState();
        restoreHidden();
        ctx.resume = resume;
        release?.();
        document.dispatchEvent(new Event('visibilitychange'));
      },
    });
  });
  try {
    await page.waitForTimeout(100);
    await page.getByRole('switch', { name: 'Reduced motion' }).click();
    expect(await page.evaluate(() => (window as any).__interruptionProbe.attempts)).toBe(1);
    await page.evaluate(async () => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
      await window.__game.audio.context.suspend();
    });
    await page.evaluate(() => (window as any).__showInterruptionPage());
    await expect.poll(() => page.evaluate(() => window.__game.audio.context.state)).toBe('running');
    expect(await page.evaluate(() => (window as any).__interruptionProbe.attempts)).toBe(2);
    await page.evaluate(() => (window as any).__releaseInterruption());
    expect(errors).toEqual([]);
  } finally {
    await page.evaluate(() => (window as any).__restoreInterruption());
  }
});
