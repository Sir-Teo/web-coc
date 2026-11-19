import { chromium } from 'playwright';
import { createHash } from 'node:crypto';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  await page.goto(process.env.GAME_URL ?? 'http://127.0.0.1:5176/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(() => {
    const { model, scene } = window.__game;
    model.state.army.swordsman = 450;
    model.startCampaign(0);
    model.activeTroop = 'swordsman';
    scene.sync();
  });
  await page.waitForFunction(() => !window.__game.scene.battleArtPending());
  const result = await page.evaluate(async () => {
    const { model, hud, scene } = window.__game;
    scene.paused = true;
    if (!model.deploy(2, 13)) throw Error('Benchmark setup deployment failed');
    const battle = model.battle;
    model.onEffect = () => {};
    hud.render();
    let updates = 0;
    const original = model.onChange;
    model.onChange = (passive) => {
      updates++;
      original(passive);
    };
    const sample = () => {
      battle.units.length = 0;
      battle.remaining.swordsman = model.state.army.swordsman = 450;
      model.state.nextId = 5000;
      model.discardRecording();
      const start = performance.now();
      for (let i = 0; i < 24; i++)
        if (model.deployMany(2, 13, 4) !== 4) throw Error('Benchmark deployment failed');
      return (performance.now() - start) / 24;
    };
    const result = [];
    for (let i = 0; i < 16; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const elapsed = sample();
      if (i >= 3) result.push(Number(elapsed.toFixed(3)));
      if (i === 2) updates = 0;
    }
    return {
      result,
      updates,
      state: { units: battle.units, remaining: battle.remaining, nextId: model.state.nextId },
    };
  });
  console.log(
    JSON.stringify({
      samples: result.result,
      updates: result.updates,
      stateSha256: createHash('sha256').update(JSON.stringify(result.state)).digest('hex'),
    }),
  );
} finally {
  await browser.close();
}
