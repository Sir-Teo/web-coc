import { expect, it } from 'vitest';
import { NATIVE_POISON_TINT, unitStatusTint } from '../src/game/unit-status-tint';
import {
  attacker,
  isolatedBattle,
  lateBuilding,
  stepFamilies,
} from './fixtures/late-defense-battle';

it('shows Poison from a real version-44 Spell Tower cast on troops and the legacy King', () => {
  const battle = isolatedBattle([lateBuilding(1, 'spelltower', 20, 20, 3, 'poison')]);
  battle.units = [
    attacker(7, 'giant', 27, 21),
    attacker(8, 'swordsman', 27.5, 21.5, 1e9, 1500, { hero: 'king' }),
    attacker(9, 'dragon', 27, 22),
  ];
  for (const unit of battle.units) expect(unitStatusTint(unit, battle)).toBeUndefined();
  for (let step = 0; step < 41; step++) stepFamilies(battle);
  for (const unit of battle.units) {
    expect(unit.late?.spellTower?.poisonTime).toBeGreaterThan(0);
    expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_POISON_TINT);
  }
});

it('keeps the legacy cue through lingering Poison and clears it when damage and slow expire', () => {
  const battle = isolatedBattle([lateBuilding(1, 'spelltower', 20, 20, 3, 'poison')]);
  const giant = attacker(7, 'giant', 27, 21);
  battle.units.push(giant);
  for (let step = 0; step < 41; step++) stepFamilies(battle);
  giant.x = 45;
  const hp = giant.hp;
  for (let step = 0; step < 50; step++) stepFamilies(battle);
  expect(giant.hp).toBeLessThan(hp);
  expect(giant.late?.spellTower?.poisonTime).toBeGreaterThan(0);
  expect(unitStatusTint(giant, battle)?.color).toBe(NATIVE_POISON_TINT);
  for (let step = 0; step < 200; step++) stepFamilies(battle);
  expect(giant.late?.spellTower).toMatchObject({ poisonTime: 0, poisonHold: 0, poisonDps: 0 });
  expect(giant.late!.spellTower!.slowUntil).toBeLessThanOrEqual(battle.elapsed);
  expect(unitStatusTint(giant, battle)).toBeUndefined();
});
