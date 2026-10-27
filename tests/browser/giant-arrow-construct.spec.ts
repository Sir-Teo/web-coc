import { expect, test, type Page } from '@playwright/test';
import { giantConstructRecording } from '../fixtures/giant-arrow-construct';

async function open(page: Page, diagonal = true, version?: number) {
  const r = giantConstructRecording(diagonal, version);
  await page.goto('/?lazyart');
  await page.waitForFunction(() => window.__game?.scene.artSettled);
  await page.locator('[data-action="skip-tutorial"]').click();
  await page.evaluate(async (r) => {
    window.__construct = r;
    const { model, scene } = window.__game;
    const { makeReplayFile, parseReplayFile } = await import('/src/game/replay-file.ts');
    scene.paused = true;
    if (!model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data)))))
      throw Error('Giant Arrow construct replay rejected');
    scene.sync();
  }, r);
  return r;
}

async function seek(page: Page, at: number) {
  return page.evaluate(async (at) => {
    const { model, scene } = window.__game;
    model.seekReplay(at);
    while (model.replay.seeking) model.step(0.05);
    model.changed();
    scene.sync();
    const { iso } = await import('/src/game/scene.ts');
    const { anchor } = window.__construct;
    const point = iso(anchor.x - 2, anchor.y + 0.5);
    scene.cameras.main.useBounds = false;
    scene.cameras.main.setZoom(innerWidth < 500 ? 0.95 : 1.3).centerOn(point.x, point.y - 55);
    const before = JSON.stringify(model.battle);
    scene.drawOverlay(0);
    return { battle: before, unchanged: before === JSON.stringify(model.battle) };
  }, at);
}

for (const width of [1440, 390])
  test(`a recalled Queen's live arrow releases the original Invisibility Tower bottle at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 960 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const r = await open(page);
    const contact = await seek(page, r.contact);
    expect(contact.battle).toBe(
      JSON.stringify(r.snapshots.find((s) => s.at === r.contact)!.battle),
    );
    const release = await seek(page, r.release);
    expect(release).toEqual({
      battle: JSON.stringify(r.snapshots.find((s) => s.at === r.release)!.battle),
      unchanged: true,
    });
    expect(
      await page.evaluate(() =>
        window.__game.model.battle.units.some((u) => u.id === window.__construct.queenId),
      ),
    ).toBe(false);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const { model, scene } = window.__game;
            scene.drawOverlay(0);
            const shot = model.battle.projectiles?.find(
              (p) =>
                p.sourceId === window.__construct.towerId &&
                p.defense?.spell?.name === 'Spell Tower Invisibility',
            );
            return !!(
              shot &&
              scene.nativeProjectiles.views
                .get(shot.id)
                ?.view.objects.some(
                  (o) => o.visible && o.alpha > 0 && o.texture?.key !== '__MISSING',
                )
            );
          }),
        { timeout: 30000 },
      )
      .toBe(true);
    await page.screenshot({ path: `output/playtest/giant-arrow-construct-release-${width}.png` });
    const field = await seek(page, r.field);
    expect(field.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.field)!.battle));
    expect(
      await page.evaluate(() => {
        const b = window.__game.model.battle;
        return (b.buildingEffects?.[2]?.invisibleUntil ?? 0) > b.elapsed;
      }),
    ).toBe(true);
    await page.screenshot({ path: `output/playtest/giant-arrow-construct-field-${width}.png` });
    expect(await seek(page, r.contact)).toEqual(contact);
    expect(await seek(page, r.release)).toEqual(release);
    await page.evaluate(() => window.__game.model.toggleReducedMotion());
    expect(await seek(page, r.field)).toEqual(field);
    expect(await page.evaluate(() => window.__game.game.renderer.gl.getError())).toBe(0);
    expect(errors).toEqual([]);
  });

for (const { diagonal, version, label } of [
  { diagonal: false, version: undefined, label: 'expired horizontal arrow' },
  { diagonal: true, version: 131, label: 'historical version 131' },
])
  test(`${label} retains tower cancellation after Recall`, async ({ page }) => {
    const r = await open(page, diagonal, version);
    const state = await seek(page, r.field);
    expect(state.battle).toBe(JSON.stringify(r.snapshots.find((s) => s.at === r.field)!.battle));
    expect(
      await page.evaluate(() => {
        const b = window.__game.model.battle;
        return {
          fired: b.nativeDefenses[window.__construct.towerId].firedAt ?? null,
          invisible: (b.buildingEffects?.[2]?.invisibleUntil ?? 0) > b.elapsed,
        };
      }),
    ).toEqual({ fired: null, invisible: false });
  });
