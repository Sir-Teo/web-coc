import { test, expect } from '@playwright/test';

test('troops deploy and fall with their own sounds, fetched only for the army that fights', async ({
  page,
}) => {
  const errors: string[] = [];
  const requested: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => requested.push(new URL(r.url()).pathname));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  // The first gesture unlocks audio.
  await page.locator('[data-action="skip-tutorial"]').click();
  const troops = () => requested.filter((p) => p.includes('/audio/troops-native/'));
  expect(troops()).toEqual([]);
  await page.evaluate(async () => {
    const { emptyArmy } = await import('/src/game/army.ts');
    const m = window.__game.model;
    m.state.army = { ...emptyArmy(), swordsman: 10 };
    m.state.spells = { ...m.state.spells, rage: 1 };
    m.changed();
    m.startBattle(0);
  });
  await page.waitForFunction(() => window.__game.scene.artSettled);
  // The Barbarian's takes and the ruin sound arrive and decode while scouting.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { troopSoundFiles, spellSoundFiles, troopSample } =
            await import('/src/game/troop-sounds.ts');
          const samples = window.__game.scene.audio.samples;
          return [...troopSoundFiles('swordsman'), ...spellSoundFiles('Rage')].every((p) =>
            samples.has(troopSample(p)),
          );
        }),
      { timeout: 20_000 },
    )
    .toBe(true);
  // Nothing for troops this army does not have.
  expect(troops().some((p) => /archer|giant|wizard/.test(p))).toBe(false);
  const ids = await page.evaluate(() => {
    const m = window.__game.model;
    m.activeTroop = 'swordsman';
    for (const [x, y] of [
      [2, 24],
      [24, 2],
      [46, 24],
      [24, 46],
    ])
      if (!m.deployBlocked(x, y) && m.deploy(x, y)) break;
    return m.battle!.units.map((u) => u.id);
  });
  expect(ids).toHaveLength(1);
  const playing = (key: string) =>
    page.evaluate((key) => {
      const samples = window.__game.scene.audio.samples as unknown as {
        active: Map<string, unknown>;
      };
      return samples.active.has(key);
    }, key);
  await expect.poll(() => playing(`troop:${ids[0]}:deploy`), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const u = window.__game.model.battle!.units[0];
    u.hp = 0;
  });
  await expect.poll(() => playing(`troop:${ids[0]}:die`), { timeout: 5000 }).toBe(true);
  // A Barbarian set beside the Town Hall swings and lands its blows with its own impact.
  const fighter = await page.evaluate(() => {
    const m = window.__game.model;
    m.activeTroop = 'swordsman';
    for (const [x, y] of [
      [2, 24],
      [24, 2],
      [46, 24],
      [24, 46],
    ])
      if (!m.deployBlocked(x, y) && m.deploy(x, y)) break;
    const u = m.battle!.units.at(-1)!,
      hall = m.battle!.buildings.find((b) => b.kind === 'townhall')!;
    u.x = hall.x - 0.3;
    u.y = hall.y + 1;
    u.path = [];
    return u.id;
  });
  await expect
    .poll(
      () =>
        page.evaluate((id) => {
          const samples = window.__game.scene.audio.samples as unknown as {
            active: Map<string, unknown>;
          };
          return [...samples.active.keys()].some((k) => k.startsWith(`troop:${id}:hit:`));
        }, fighter),
      { timeout: 10_000 },
    )
    .toBe(true);
  // A Rage Spell's bottle falls with its own sound.
  const cast = await page.evaluate(() => {
    const m = window.__game.model;
    m.activeSpell = 'rage';
    m.castSpell(24, 24);
    return m.battle!.nativeSpells!.at(-1)!.id;
  });
  await expect.poll(() => playing(`spell:${cast}:preDeploy`), { timeout: 5000 }).toBe(true);
  expect(errors).toEqual([]);
});
