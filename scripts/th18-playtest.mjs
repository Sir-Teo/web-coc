import { chromium, webkit } from '@playwright/test';
import fs from 'node:fs/promises';
const base = process.env.GAME_URL ?? 'http://localhost:5191';
await fs.mkdir('output/th18', { recursive: true });
for (const [name, type] of [
  ['chromium', chromium],
  ['webkit', webkit],
]) {
  const browser = await type.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`);
  });
  await page.goto(base + '/?devtools=1');
  await page.waitForFunction(() => window.__game?.scene.ready, {}, { timeout: 120000 });
  await page.evaluate(async () => {
    const { makeBuilding } = await import('/src/game/model.ts');
    const { BUILDINGS, maxLevelFor } = await import('/src/game/data.ts');
    const { model, scene } = window.__game;
    model.state.obstacles = [];
    model.state.tutorial = true;
    model.state.coach = 4;
    model.state.buildings = Object.keys(BUILDINGS).map((kind, i) =>
      makeBuilding(
        i + 1,
        kind,
        3 + (i % 8) * 5,
        3 + Math.floor(i / 8) * 6,
        maxLevelFor(kind, 18) || 1,
      ),
    );
    model.state.nextId = 1000;
    model.state.gold = model.state.elixir = 99999999;
    model.state.dark = 9999999;
    model.changed();
    scene.sync();
    scene.resetCamera();
  });
  await page.waitForFunction(
    () =>
      window.__game.scene.children.list.filter((o) => o.getData?.('nativeVillage')).length > 200,
    {},
    { timeout: 120000 },
  );
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `output/th18/home-${name}.png` });
  const home = await page.evaluate(() => ({
    buildings: window.__game.model.state.buildings.length,
    nativeObjects: window.__game.scene.children.list.filter((o) => o.getData?.('nativeVillage'))
      .length,
  }));
  await page.evaluate(() => window.__game.model.move(window.__game.model.townhall.id));
  await page.mouse.move(750, 450);
  await page.waitForFunction(() =>
    window.__game.scene.children.list.some((o) => o.getData?.('nativeVillage') === -1),
  );
  await page.screenshot({ path: `output/th18/placement-${name}.png` });
  await page.evaluate(() => window.__game.model.cancel());
  await page.evaluate(async () => {
    const { TROOP_KEYS, maxTroopLevel } = await import('/src/game/data.ts');
    const { model } = window.__game;
    model.state.troopLevels ??= {};
    for (const k of TROOP_KEYS) {
      model.state.army[k] = 1;
      model.state.troopLevels[k] = maxTroopLevel(k);
    }
    model.startBattle(0, true);
    window.__th18Step = model.step.bind(model);
    model.step = () => {};
    for (const [i, k] of TROOP_KEYS.entries()) {
      model.activeTroop = k;
      if (!model.deploy(2 + (i % 16) * 2.5, 46)) throw Error(`Could not deploy ${k}`);
    }
  });
  await page.waitForFunction(
    () => window.__game?.scene.troopNativePresentation.packs.size === 32,
    {},
    { timeout: 120000 },
  );
  await page.evaluate(() => {
    window.__game.model.step = window.__th18Step;
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `output/th18/battle-${name}.png` });
  const battle = await page.evaluate(() => ({
    units: window.__game.model.battle.units.length,
    animationPacks: window.__game.scene.troopNativePresentation.packs.size,
    nativeObjects: window.__game.scene.children.list.filter((o) => o.getData?.('nativeTroop'))
      .length,
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `output/th18/phone-${name}.png` });
  await fs.writeFile(`output/th18/${name}.json`, JSON.stringify({ home, battle, errors }, null, 2));
  console.log(name, JSON.stringify({ home, battle, errors }));
  await browser.close();
  if (errors.length) process.exitCode = 1;
}
