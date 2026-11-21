import { expect, it } from 'vitest';
import { stepInfernos } from '../src/game/inferno-battle';
import { makeBuilding } from '../src/game/model';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { replayBattle, REPLAY_VERSION } from '../src/game/replay';
import { attacker, lateSetup } from './fixtures/late-defense-battle';

it('Campaign Inferno beams respect Ice Block without treating it as invisibility', () => {
  const tower = { ...makeBuilding(1, 'inferno', 10, 10, 8), infernoMode: 'multi' as const };
  const run = (version: number, coversTower = false) => {
    const setup = lateSetup(58, {}, [tower]);
    setup.spells.iceblock = 1;
    const battle = replayBattle(setup, version);
    const frozen = attacker(10, 'giant', 15, 11, 1000),
      exposed = attacker(11, 'giant', 11, 11, 1000),
      hidden = attacker(12, 'giant', 11, 13, 1000, 1000, {
        native: { effects: { invisibleUntil: 20 } },
      });
    battle.units = [frozen, exposed, hidden];
    const cast = castNativeSpell(battle, 'Ice Block', 1, 'attack', coversTower ? 17 : 17.5, 11);
    battle.elapsed = cast.firstHit;
    stepNativeSpells({ battle, effect: () => {}, damageBuilding: () => {} });
    expect(frozen.native?.effects?.iceBlockShield?.percent).toBeCloseTo(0.86);
    expect(exposed.native?.effects?.iceBlockShield).toBeUndefined();
    if (coversTower) {
      const iceBlockStun = battle.defenseStuns[tower.id] ?? 0;
      const freeze = castNativeSpell(battle, 'Freeze', 1, 'attack', tower.x + 1, tower.y + 1);
      battle.elapsed = freeze.firstHit;
      stepNativeSpells({ battle, effect: () => {}, damageBuilding: () => {} });
      expect(battle.defenseStuns[tower.id]).toBeGreaterThan(battle.elapsed);
      return iceBlockStun;
    }
    battle.elapsed = cast.firstHit + 0.4;
    stepInfernos(battle, 0.4);
    expect(battle.infernos![tower.id].scheduler.slots.map((slot) => slot.targetId)).toEqual(
      expect.arrayContaining([frozen.id, exposed.id]),
    );
    expect(hidden.hp).toBe(1000);
    return { frozen: 1000 - frozen.hp, exposed: 1000 - exposed.hp };
  };
  expect(run(296, true)).toBeGreaterThan(0);
  expect(run(REPLAY_VERSION, true)).toBe(0);
  const legacy = run(296);
  if (typeof legacy === 'number') throw Error('Expected beam damage');
  expect(legacy.frozen).toBeCloseTo(legacy.exposed);
  const current = run(REPLAY_VERSION);
  if (typeof current === 'number') throw Error('Expected beam damage');
  expect(current.exposed).toBeGreaterThan(0);
  expect(current.frozen).toBeCloseTo(current.exposed * 0.14);
});
