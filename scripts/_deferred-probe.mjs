import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto('http://127.0.0.1:5190/');
await page.waitForFunction(() => window.__game?.scene.ready, null, { timeout: 120000 });
await page.locator('[data-action="skip-tutorial"]').click();
await page.locator('#loading').waitFor({ state: 'detached' });
await page.evaluate(async () => {
  const { freshNativeCampaign } = await import('/src/game/native-campaign.ts');
  const { emptyArmy } = await import('/src/game/army.ts');
  const m = window.__game.model;
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars.fill(1);
  m.state.army = { ...emptyArmy(), archer: 10 };
  m.changed();
});
await page.locator('.attack-btn').click();
await page.locator('[data-action="attack:63"]').click();
await page.waitForFunction(() => window.__game.scene.lateAssetsReady, null, { timeout: 60000 });
await page.waitForTimeout(500);
const info = await page.evaluate(() => {
  const { model: m, scene } = window.__game;
  for (let y = 24.5; y < 46; y += 0.5)
    for (let x = 24.5; x < 46; x += 0.5) {
      const point = scene.screenFor(x, y);
      if ([-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => !m.deployBlocked(x + dx, y + dy))) && point.x > 300 && point.x < innerWidth - 300 && point.y > 300 && point.y < innerHeight - 240) {
        const el = document.elementFromPoint(point.x, point.y);
        return { x, y, point, el: el?.tagName + '.' + el?.className, active: m.activeTroop, remaining: m.battle.remaining.archer, uiBlocked: scene.uiBlocked };
      }
    }
});
console.log(JSON.stringify(info));
await page.mouse.click(info.point.x, info.point.y);
await page.waitForTimeout(300);
console.log(JSON.stringify(await page.evaluate(() => ({ units: window.__game.model.battle.units.length, toast: document.querySelector('#toast')?.textContent }))));
console.log(errors);
await browser.close();
