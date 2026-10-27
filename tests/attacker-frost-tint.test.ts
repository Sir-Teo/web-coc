import { expect, it } from 'vitest';
import {
  NATIVE_FREEZE_TINT,
  NATIVE_POISON_TINT,
  unitStatusTint,
} from '../src/game/unit-status-tint';
import { unitSpeedScale } from '../src/game/native-status';
import { garrisonUnitScales } from '../src/game/garrison-status';
import { stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { applyAttackerFrost, attackerFrostArena } from './fixtures/attacker-frost';

for (const source of ['ghost', 'townhall'] as const)
  for (const hero of [false, true])
    it(`shows the ${source} partial-frost cue on a ${hero ? 'King' : 'Giant'} until its exact deadline`, () => {
      const { battle, unit } = attackerFrostArena(hero);
      expect(unitStatusTint(unit, battle)).toBeUndefined();
      const until = applyAttackerFrost(battle, unit, source);
      const scale =
        source === 'ghost'
          ? garrisonUnitScales(battle, unit).move
          : unitSpeedScale(unit, battle.elapsed);
      expect(scale).toBe(0.5);
      expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_FREEZE_TINT);
      // Partial frost cannot hide Poison; a friendly Rage cannot hide partial frost.
      unit.spellRageUntil = until + 1;
      expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_FREEZE_TINT);
      (unit.native ??= {}).effects ??= {};
      unit.native.effects.poison = {
        until: battle.elapsed + 0.5,
        since: battle.elapsed,
        dps: 1,
        speed: -0.1,
        attackSpeed: -0.1,
      };
      expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_POISON_TINT);
      battle.elapsed += 0.5;
      expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_FREEZE_TINT);
      battle.elapsed = until;
      expect(unitStatusTint(unit, battle)?.color).toBe(0xf2b3ff);
      delete unit.spellRageUntil;
      expect(unitStatusTint(unit, battle)).toBeUndefined();
    });

it('picks up partial frost produced by an actual Royal Ghost hit', () => {
  const { battle, unit } = attackerFrostArena(false);
  unit.hp = unit.maxHp = 10000;
  const ghost = spawnGarrisonDefender(battle, 'royalghost', 7, 1, 9, 8, 0);
  for (let steps = 0; !unit.late?.garrison?.frost && steps < 200; steps++) {
    battle.elapsed += 0.05;
    stepDefenders(battle, 0.05, () => {});
  }
  expect(ghost.attacks.length).toBeGreaterThan(0);
  expect(unit.late?.garrison?.frost?.scale).toBe(0.5);
  expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_FREEZE_TINT);
});

it('leaves zero-strength chill and frost neutral', () => {
  const { battle, unit } = attackerFrostArena(false);
  unit.native = { effects: { chill: { until: 10, percent: 0 } } };
  unit.late = { garrison: { frost: { from: 0, until: 10, scale: 1, sourceId: -1 } } };
  expect(unitStatusTint(unit, battle)).toBeUndefined();
});
