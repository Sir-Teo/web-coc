import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('unreadable saves remain untouched and can be downloaded from the startup screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('recovery-seeded')) {
      localStorage.setItem('crown-clan-save-v1', '{broken village');
      sessionStorage.setItem('recovery-seeded', 'yes');
    }
  });
  await page.goto('/');
  await expect(page.locator('#load-label')).toContainText('Your saved village could not be opened');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('crown-and-clan-backup-recovery.json');
  expect(await readFile((await download.path())!, 'utf8')).toBe('{broken village');
  await page.screenshot({ path: `output/playtest/save-recovery-${test.info().project.name || 'chromium'}.png` });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Download backup' })).toBeVisible();
  expect(await page.evaluate(() => ({
    stored: localStorage.getItem('crown-clan-save-v1'),
    started: !!window.__game,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }))).toEqual({ stored: '{broken village', started: false, overflow: false });
});
