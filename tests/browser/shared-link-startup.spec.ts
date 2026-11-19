import { expect, test } from '@playwright/test';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { encodeArmy } from '../../src/game/army-share';
import { encodeLayout } from '../../src/game/layout-share';
import { initialSave } from '../../src/game/model';

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const terrain = '**/assets/environment/terrain-field-v4.webp';

for (const kind of ['army', 'layout'] as const)
  for (const mode of ['slow terrain', 'retry after failure'] as const)
    test(`a shared ${kind} preview survives ${mode} and waits for confirmation`, async ({
      page,
    }, info) => {
      const save = initialSave();
      save.tutorial = true;
      const positions = save.buildings.map(({ kind, x, y }) => ({ kind, x, y }));
      const layout = positions.map((entry) => ({ ...entry }));
      const cannon = layout.find((entry) => entry.kind === 'cannon')!;
      const tower = layout.find((entry) => entry.kind === 'archertower')!;
      [cannon.x, tower.x] = [tower.x, cannon.x];
      [cannon.y, tower.y] = [tower.y, cannon.y];
      const code =
        kind === 'army'
          ? encodeArmy({
              name: 'Startup share',
              army: { ...emptyArmy(), swordsman: 3 },
              spells: emptySpells(),
            })!
          : encodeLayout(2, layout)!;
      await page.addInitScript((value) => {
        if (!localStorage.getItem('crown-clan-save-v1'))
          localStorage.setItem('crown-clan-save-v1', value);
      }, JSON.stringify(save));

      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(terrain, async (route) => {
        if (mode === 'retry after failure')
          await route.fulfill({ status: 503, body: 'Terrain unavailable' });
        else {
          await held;
          await route.continue();
        }
      });
      try {
        await page.goto(`/?lazyart#${kind}=${code}`, { waitUntil: 'domcontentloaded' });
        const retry = page.getByRole('button', { name: 'Try again' });
        await expect(retry).toBeVisible({ timeout: 16000 });
        expect(new URL(page.url()).hash).toBe(`#${kind}=${code}`);
        if (mode === 'retry after failure') {
          await page.unroute(terrain);
          await retry.tap();
        }
      } finally {
        release();
      }

      await expect(page.locator('#loading')).toBeHidden({ timeout: 20000 });
      await expect(page.locator('#modal-title')).toHaveText(
        kind === 'army' ? 'Quick armies' : 'Saved layouts',
      );
      const field = page.locator(`#${kind}-code`);
      await expect(field).toHaveValue(code);
      await expect(page.getByRole('button', { name: 'Close dialog' })).toBeFocused();
      expect(new URL(page.url()).hash).toBe('');
      const state = () =>
        page.evaluate(() => {
          const { state } = window.__game.model;
          return {
            army: state.army,
            spells: state.spells,
            positions: state.buildings.map(({ kind, x, y }) => ({ kind, x, y })),
            presets: state.armyPresets ?? [],
            layouts: state.layouts ?? [],
          };
        });
      const before = { army: save.army, spells: save.spells, positions, presets: [], layouts: [] };
      expect(await state()).toEqual(before);
      const persisted = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('crown-clan-save-v1')!);
        return {
          army: saved.army,
          spells: saved.spells,
          positions: saved.buildings.map(
            ({ kind, x, y }: { kind: string; x: number; y: number }) => ({ kind, x, y }),
          ),
          presets: saved.armyPresets ?? [],
          layouts: saved.layouts ?? [],
        };
      });
      expect(persisted).toEqual(before);
      await page.screenshot({ path: info.outputPath(`${kind}-startup-preview.png`) });

      if (kind === 'army') {
        await page.getByRole('button', { name: 'Use shared army' }).tap();
        expect(await state()).toEqual({ ...before, army: { ...emptyArmy(), swordsman: 3 } });
      } else {
        await page.locator('[data-action="layout-import:0"]').tap();
        expect((await state()).layouts[0]?.slots.length).toBeGreaterThan(0);
        expect((await state()).positions).toEqual(before.positions);
      }
    });
