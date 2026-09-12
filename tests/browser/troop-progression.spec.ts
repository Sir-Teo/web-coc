import { test, expect } from '@playwright/test';
import { useDevelopedVillage } from './developed-village';

for (const viewport of [
  { width: 1440, height: 960 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 568, height: 320 },
]) {
  test.describe(`native troop roster at ${viewport.width}×${viewport.height}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await page.waitForFunction(() => window.__game?.scene.ready);
      await page.locator('#loading').waitFor({ state: 'detached' });
      await useDevelopedVillage(page);
      await page.locator('[data-action="skip-tutorial"]').click();
      await page.evaluate(() => {
        const m = window.__game.model;
        m.townhall.level = 8;
        m.state.elixir = 200000;
        m.state.buildings.find((b) => b.kind === 'laboratory').level = 2;
        m.changed();
      });
    });

    test('research shows exact troop requirements and persists a Giant upgrade', async ({
      page,
      browserName,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.locator('.train-add').click();
      await page.locator('[data-action="research"]').click();
      for (const [kind, stats, cost] of [
        ['giant', /Health 400 → 500.*Damage 24 → 30/, '40,000'],
        ['balloon', /Health 150 → 180.*Damage 75 → 96/, '100,000'],
        ['goblin', /Health 25 → 30.*Damage 11 → 14/, '45,000'],
        ['wallbreaker', /Health 20 → 24.*Damage 10 → 20/, '80,000'],
      ] as const) {
        const button = page.locator(`[data-action="research-start:${kind}"]`);
        const card = page.locator('.training-card').filter({ has: button });
        await expect(card.locator('.research-stats')).toHaveText(stats);
        await expect(button).toBeEnabled();
        await expect(button).toContainText(cost);
      }
      const wizard = page.locator('[data-action="research-start:wizard"]');
      await expect(wizard).toBeDisabled();
      await expect(wizard).toHaveText('Requires laboratory 3');
      await page.evaluate(() => {
        const m = window.__game.model;
        m.state.buildings.find((b) => b.kind === 'laboratory').level = 3;
        m.changed();
      });
      await expect(wizard).toBeEnabled();
      await expect(wizard).toContainText('120,000');
      await page.locator('[data-action="research-start:giant"]').click();
      const before = await page.evaluate(async () => {
        const m = window.__game.model;
        const { saveGame } = await import('/src/game/save.ts');
        await saveGame(m.state);
        return {
          end: m.state.research.end,
          remaining: m.state.research.end - m.clock,
          elixir: m.state.elixir,
          gems: m.state.gems,
        };
      });
      expect(before.elixir).toBe(160000);
      expect(before.remaining).toBeGreaterThan(7195000);
      expect(before.remaining).toBeLessThanOrEqual(7200000);
      await page.reload();
      await page.waitForFunction(() => window.__game?.scene.ready);
      await page.locator('#loading').waitFor({ state: 'detached' });
      await page.locator('.train-add').click();
      await page.locator('[data-action="research"]').click();
      expect(await page.evaluate(() => window.__game.model.state.research.end)).toBe(before.end);
      await page.locator('[data-action="research-finish"]').click();
      const giant = page.locator('[data-action="research-start:giant"]');
      await expect(giant).toBeDisabled();
      await expect(giant).toHaveText('Requires laboratory 4');
      await expect(
        page.locator('.training-card').filter({ has: giant }).locator('.research-stats'),
      ).toHaveText(/Health 500 → 600.*Damage 30 → 40/);
      expect(
        await page.evaluate(() => {
          const m = window.__game.model;
          return { level: m.troopLevel('giant'), elixir: m.state.elixir, gems: m.state.gems };
        }),
      ).toEqual({ level: 2, elixir: before.elixir, gems: before.gems - 31 });
      await page.locator('.modal').evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      if (viewport.width === 1440)
        await page.screenshot({ path: `output/playtest/troop-roster-research-${browserName}.png` });
      expect(errors).toEqual([]);
    });

    test('details show researched attacks, movement and death damage with reachable controls', async ({
      page,
      browserName,
    }) => {
      await page.evaluate(() => {
        const m = window.__game.model;
        m.state.troopLevels = Object.fromEntries(Object.keys(m.state.army).map((k) =>
          [k, ['healer', 'dragon', 'pekka'].includes(k) ? 3 : 4]));
        m.changed();
      });
      await page.locator('.train-add').click();
      for (const [name, stats] of [
        [
          'Giant',
          {
            Hitpoints: '700',
            'Damage per second': '24',
            'Damage per hit': '48',
            'Movement speed': '1.5 tiles/s',
            'Attack range': '1 tile',
            'Attack interval': '2s',
          },
        ],
        [
          'Wizard',
          {
            Hitpoints: '135',
            'Damage per second': '125',
            'Damage per hit': '187.5',
            'Attack splash': '0.3 tiles',
            'Attack range': '3 tiles',
            'Attack interval': '1.5s',
          },
        ],
        [
          'Balloon',
          {
            Hitpoints: '280',
            'Damage per second': '72',
            'Damage per hit': '216',
            'Damage on destruction': '72',
            'Death blast radius': '1.2 tiles',
            'Movement speed': '1.25 tiles/s',
            'Attack range': '0.5 tiles',
          },
        ],
        [
          'Goblin',
          {
            Hitpoints: '50',
            'Damage per second': '24',
            'Movement speed': '4 tiles/s',
            'Attack range': '0.4 tiles',
            'Favorite target': 'Resources (2× damage)',
          },
        ],
        [
          'Wall Breaker',
          {
            Hitpoints: '35',
            'Damage per hit': '30',
            'Damage on destruction': '16',
            'Death blast radius': '2 tiles',
            'Contact damage vs walls': '1,840',
            'Movement speed': '3 tiles/s',
            'Attack range': '1 tile',
          },
        ],
      ] as const) {
        await page.getByRole('button', { name: `About ${name}`, exact: true }).click();
        for (const [label, value] of Object.entries(stats)) {
          const stat = page
            .locator('.troop-stats > div')
            .filter({ has: page.getByText(label, { exact: true }) });
          await expect(stat.locator('dd')).toHaveText(value);
        }
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
          viewport.width,
        );
        await page.locator('.modal').evaluate(async (el) => {
          await Promise.all(el.getAnimations().map((a) => a.finished));
        });
        if (viewport.height <= 600 && viewport.width > viewport.height) {
          const layout = await page.locator('.troop-info-body').evaluate((body) => {
            const portrait = body.querySelector('.troop-info-hero')!.getBoundingClientRect();
            const stats = body.querySelector('.troop-stats')!.getBoundingClientRect();
            const bounds = body.getBoundingClientRect();
            return {
              portraitRight: portrait.right,
              portraitTop: portrait.top,
              statsLeft: stats.left,
              statsTop: stats.top,
              visibleFirstRows: [...body.querySelectorAll('.troop-stats > div')]
                .slice(0, 6)
                .every((cell) => {
                  const r = cell.getBoundingClientRect();
                  return (
                    r.top >= bounds.top &&
                    r.bottom <= bounds.bottom &&
                    cell.scrollWidth <= cell.clientWidth
                  );
                }),
            };
          });
          expect(layout.statsLeft).toBeGreaterThan(layout.portraitRight);
          expect(layout.statsTop).toBeCloseTo(layout.portraitTop, 0);
          expect(layout.visibleFirstRows).toBe(true);
          const close = await page
            .getByRole('button', { name: 'Close dialog', exact: true })
            .boundingBox();
          expect(close!.width).toBeGreaterThanOrEqual(44);
          expect(close!.height).toBeGreaterThanOrEqual(44);
        }
        if (name === 'Wall Breaker' || name === 'Wizard')
          await page.screenshot({
            path: `output/playtest/troop-roster-${name.replace(' ', '-').toLowerCase()}-${viewport.width}-${browserName}.png`,
          });
        const train = page
          .locator('.troop-info-body')
          .getByRole('button', { name: 'Train troops', exact: true });
        await train.scrollIntoViewIfNeeded();
        const box = await train.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
        await train.click();
        await expect(
          page.getByRole('button', { name: `About ${name}`, exact: true }),
        ).toBeVisible();
      }
      await page.getByRole('button', { name: 'About Wizard', exact: true }).click();
      await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
      await expect(page.locator('.troop-info-body')).toHaveCount(0);
    });
  });
}
