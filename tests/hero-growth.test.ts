import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { gauntletBattle, gauntletKnockoutRecording } from './fixtures/giant-gauntlet';
import { heroGrowthScale, heroKnockoutFadeAt } from '../src/game/hero-growth';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it('keeps a recalled timed effect from reappearing just because the roster has the item', () => {
  const { model, battle, unit, hero } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  expect(heroGrowthScale(battle, unit)).toBe(1.7);
  battle.spells.recall = 1;
  model.activeSpell = 'recall';
  expect(model.castSpell(unit.x, unit.y)).toBe(true);
  while (hero.unitId !== null) {
    expect(battle.elapsed).toBeLessThan(5);
    model.step(0.05);
  }
  expect(model.deployNativeHero('king', 5, 6.5)).toBe(true);
  const deployed = battle.units.find((u) => u.id === hero.unitId)!;
  expect(deployed.id).not.toBe(unit.id);
  expect(heroGrowthScale(battle, deployed)).toBe(1);
  model.step(0.05);
  expect(heroGrowthScale(battle, deployed)).toBe(1);
});

it("does not grow a King copy that carries another unit's effect metadata", () => {
  const { model, battle, unit } = gauntletBattle();
  model.activateNativeHeroAbility('king');
  const copy = { ...structuredClone(unit), id: 9999 };
  expect(heroGrowthScale(battle, copy)).toBe(1);
  copy.hp = 0;
  copy.defeatedAt = 1;
  expect(heroKnockoutFadeAt(battle, copy)).toBe(1);
});

it.each([0, 15])(
  'keeps ordinary knockout timing for death at %s outside the active period',
  (fallen) => {
    const { model, battle, unit, hero } = gauntletBattle();
    battle.elapsed = 1;
    model.activateNativeHeroAbility('king');
    hero.abilityAt = 1;
    unit.hp = 0;
    unit.defeatedAt = fallen;
    expect(heroKnockoutFadeAt(battle, unit)).toBe(fallen);
  },
);

it.each([1, 27])(
  'reconstructs a real level %s Gauntlet knockout through portable backward seeks',
  (level) => {
    const { data, snapshots, alive, held, fading, gone, deadline, unitId } =
      gauntletKnockoutRecording(level);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
    for (const snapshot of [...snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const battle = viewer.battle!;
      const unit = battle.units.find((u) => u.id === unitId)!;
      expect(JSON.parse(JSON.stringify(battle))).toEqual(snapshot.battle);
      expect(heroGrowthScale(battle, unit)).toBe(
        snapshot.at < deadline ? (level === 1 ? 1.7 : 2.15) : 1,
      );
      if (snapshot.at === alive) expect(unit.hp).toBeGreaterThan(0);
      else {
        expect(unit.hp).toBeLessThanOrEqual(0);
        expect(heroKnockoutFadeAt(battle, unit)).toBe(deadline);
        if (snapshot.at === held)
          expect(snapshot.at - unit.defeatedAt!).toBeGreaterThanOrEqual(2 - 1e-9);
      }
    }
    expect(fading).toBeCloseTo(deadline + 0.75, 9);
    expect(gone).toBeCloseTo(deadline + 1.6, 9);
  },
);
