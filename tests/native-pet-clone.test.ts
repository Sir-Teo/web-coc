import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { replayBattle, type ReplayData } from '../src/game/replay';
import { PET_UNIT_KINDS, nativeUnitStats } from '../src/game/native-units';
import { initialNativeState } from '../src/game/native-troops';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';

it.each(PET_UNIT_KINDS)('excludes %s from Clone without spending its housing budget', (kind) => {
  for (const version of [94, 95]) {
    const model = new GameModel();
    model.startBattle(0, true);
    const data = (model as unknown as { recording: ReplayData }).recording;
    const battle = replayBattle(data.initial, version);
    let id = 1000;
    const spawn = (kind: Unit['kind'], level: number, x: number, y: number, at: number) => {
      const stats = nativeUnitStats(kind, level);
      const unit: Unit = {
        id: id++,
        kind,
        level,
        x,
        y,
        hp: stats.hp,
        maxHp: stats.hp,
        cooldown: 0,
        target: null,
        path: [],
        pathAt: 0,
        attacking: false,
        spawnedAt: at,
        native: initialNativeState(kind, level),
      };
      battle.units.push(unit);
      return unit;
    };
    // A level-one Clone can copy either this 20-housing pet or this five-housing Giant.
    // The pet was deployed first, so incorrect eligibility also steals the Giant's budget.
    spawn(kind, 1, 5, 5, 0);
    spawn('giant', 1, 5, 5, 0);
    const cast = castNativeSpell(battle, 'Clone', 1, 'attack', 5, 5);
    battle.elapsed = cast.firstHit;
    stepNativeSpells({ battle, spawn, damageBuilding() {}, effect() {} });
    const copies = battle.units.filter((u) => u.native?.cloneUntil !== undefined);
    expect(copies.map((u) => u.kind)).toEqual([version >= 95 ? 'giant' : kind]);
    expect(cast.budget).toBe(version >= 95 ? 17 : 2);
  }
});
