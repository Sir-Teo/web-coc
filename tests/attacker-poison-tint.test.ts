import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { initialNativeState } from '../src/game/native-troops';
import {
  unitStatusTint,
  NATIVE_POISON_TINT,
  NATIVE_FREEZE_TINT,
} from '../src/game/unit-status-tint';
import { attackerPoisonTintRecording } from './fixtures/attacker-poison-tint';

for (const hero of [false, true])
  it(`reconstructs Headhunter Poison tint and expiry on an attacking ${hero ? 'King' : 'Giant'}`, () => {
    const recording = attackerPoisonTintRecording(hero);
    const viewer = new GameModel();
    expect(viewer.openReplay(recording.data)).toBe(true);
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const battle = viewer.battle!;
      return { battle, unit: battle.units.find((u) => u.id === recording.unitId)! };
    };
    for (let repeat = 0; repeat < 2; repeat++) {
      const { battle, unit } = seek(recording.poisoned);
      expect(unit.hp).toBeGreaterThan(0);
      expect(unit.late?.garrison?.poison?.until).toBeGreaterThan(battle.elapsed);
      expect(unitStatusTint(unit, battle)?.color).toBe(NATIVE_POISON_TINT);
      // Freeze retains its existing priority; Rage cannot hide the harmful status.
      const boosted = { ...unit, spellRageUntil: battle.elapsed + 10 };
      expect(unitStatusTint(boosted, battle)?.color).toBe(NATIVE_POISON_TINT);
      const native = initialNativeState(unit.kind, 1)!;
      native.effects = { frozenUntil: battle.elapsed + 1 };
      expect(unitStatusTint({ ...boosted, native }, battle)?.color).toBe(NATIVE_FREEZE_TINT);
      const expired = seek(recording.expired);
      expect(expired.unit.hp).toBeGreaterThan(0);
      expect(expired.unit.late?.garrison?.poison).toBeUndefined();
      expect(unitStatusTint(expired.unit, expired.battle)).toBeUndefined();
    }
  });
