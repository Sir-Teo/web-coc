import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: process.env.ARMY_BENCH_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const url = new URL(process.env.ARMY_BENCH_URL ?? 'http://127.0.0.1:5176/');
  url.searchParams.set('lazyart', '');
  await page.goto(url.href);
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async () => {
    const { model, scene } = window.__game;
    const { makeBuilding } = await import('/src/game/model.ts');
    const { BUILDINGS } = await import('/src/game/data.ts');
    scene.paused = true;
    model.townhall.level = 18;
    for (const building of model.state.buildings) {
      if (building.kind === 'barracks') building.level = 19;
      if (building.kind === 'camp') building.level = 14;
    }
    model.state.obstacles = [];
    const { buildings } = model.state;
    for (const [kind, level] of [
      ['darkbarracks', 13],
      ['workshop', 8],
      ['spellfactory', 9],
      ['darkspellfactory', 8],
    ])
      buildings.push(makeBuilding(model.state.nextId++, kind, 36, 36, level));
    for (let y = 1; y < 46 && buildings.length < 340; y++)
      for (let x = 1; x < 46 && buildings.length < 340; x++)
        if (
          !buildings.some(
            (b) =>
              x >= b.x &&
              x < b.x + BUILDINGS[b.kind].size &&
              y >= b.y &&
              y < b.y + BUILDINGS[b.kind].size,
          )
        )
          buildings.push(makeBuilding(model.state.nextId++, 'wall', x, y, 1));
    model.clearArmy();
  });
  await page.locator('.train-add').click();
  await page.locator('[data-action="train:swordsman"]').waitFor({ state: 'visible' });
  const samples = await page.evaluate(async () => {
    const { model, hud } = window.__game;
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const sample = (count) => {
      const start = performance.now();
      for (let i = 0; i < count; i++) {
        if (i % 2) model.removeTroop('swordsman');
        else model.train('swordsman');
        hud.render();
      }
      return (performance.now() - start) / count;
    };
    for (let i = 0; i < 4; i++) {
      await frame();
      sample(20);
    }
    const result = [];
    for (let i = 0; i < 13; i++) {
      await frame();
      result.push(Number(sample(24).toFixed(3)));
    }
    return {
      buildings: model.state.buildings.length,
      cards: document.querySelectorAll('.army-tile').length,
      samples: result,
    };
  });
  console.log(JSON.stringify(samples));
} finally {
  await browser.close();
}
