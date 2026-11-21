import { test, expect } from '@playwright/test';
import type { Save } from '../../src/game/model';

for (const [width, height] of [
  [568, 320],
  [390, 844],
]) {
  test.describe(`backup navigation at ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, isMobile: true, hasTouch: true });

    test('cancel returns to the backup controls without replacing the village', async ({
      page,
    }, info) => {
      await page.goto('/');
      await expect(page.locator('#loading')).toBeHidden({ timeout: 30000 });
      const save = () =>
        page.evaluate(() => {
          const { lastTick, saveRevision, buildings, ...state } = JSON.parse(
            localStorage.getItem('crown-clan-save-v1')!,
          ) as Save;
          return { ...state, buildings: buildings.map(({ stored, ...building }) => building) };
        });
      await page.getByRole('button', { name: 'Settings', exact: true }).tap();
      const download = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export without recordings' }).tap();
      const path = info.outputPath('village.json');
      await (await download).saveAs(path);
      const originalSound = (await save()).settings.sound;
      await page.getByRole('switch', { name: 'Sound effects' }).tap();
      await expect.poll(async () => (await save()).settings.sound).toBe(!originalSound);
      const before = await save();

      const backup = page.getByRole('button', { name: 'Import backup' });
      const preview = async () => {
        const chooser = page.waitForEvent('filechooser');
        await backup.tap();
        await (await chooser).setFiles(path);
        await expect(page.getByRole('dialog', { name: 'Replace this village?' })).toBeVisible();
      };
      await preview();
      await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
      await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible();
      expect(await save()).toEqual(before);
      await expect(backup).toBeInViewport({ ratio: 0.95 });
      await expect(backup).toBeFocused();
      await expect(page.locator('#toast')).not.toHaveClass(/show/);
      await page.screenshot({
        path: info.outputPath('returned-settings.png'),
        animations: 'disabled',
      });
      await preview();
      await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
      expect(await save()).toEqual(before);
    });
  });
}
