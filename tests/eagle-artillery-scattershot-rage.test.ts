import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeBuilding, type Battle, type Building, type Unit } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import { TROOP_KEYS } from '../src/game/data';
import { stepLateCampaign } from '../src/game/late-campaign';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import { isolatedSetup } from './fixtures/late-defense-battle';

/** Spell Tower Rage is owned by another family; its boost hook is stubbed here. */
const boost = vi.hoisted(() => ({ damage: 1, rate: 1, calls: new Set<string>() }));
vi.mock('../src/game/spell-tower', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/game/spell-tower')>();
  return {
    ...actual,
    spellTowerDefenseBoost: (_battle: Battle, building: Building) => {
      boost.calls.add(building.kind);
      return { damage: boost.damage, rate: boost.rate };
    },
  };
});

let nextUnit = 1;
function unit(kind: Unit['kind'], x: number, y: number): Unit {
  return { id: nextUnit++, kind, x, y, hp: 1e6, maxHp: 1e6, cooldown: 0, target: null, path: [], pathAt: 0, attacking: false };
}
function defense(kind: 'eagleartillery' | 'scattershot', level: number): Building {
  const hp = NATIVE_COMBAT[kind === 'eagleartillery' ? 1000031 : 1000067].hp[level - 1];
  return { ...makeBuilding(700, kind, 20, 20, level), hp, maxHp: hp };
}
function board(kind: 'eagleartillery' | 'scattershot', level: number, offset: number) {
  const battle = replayBattle(isolatedSetup(kind === 'eagleartillery' ? 65 : 75, defense(kind, level), { giant: 40 }), 44);
  battle.started = true;
  for (const troop of TROOP_KEYS) battle.remaining[troop] = 0;
  const size = kind === 'eagleartillery' ? 4 : 3;
  battle.units.push(unit('giant', 20 + size / 2 + offset, 20 + size / 2));
  return battle;
}
function advance(battle: Battle, seconds: number) {
  for (let t = 0; t < seconds - 1e-9; t += 0.05) {
    battle.elapsed += 0.05;
    stepLateCampaign({ battle, dt: 0.05, phase: 'defenses', effect: () => {}, damageBuilding: () => {} });
  }
}
afterEach(() => {
  boost.damage = boost.rate = 1;
});

describe('Spell Tower Rage hook', () => {
  it('scales Eagle Artillery shell damage and charge rate through spellTowerDefenseBoost', () => {
    // Shells launched from about four seconds are still in flight at six.
    const neutral = board('eagleartillery', 1, 12);
    advance(neutral, 6);
    boost.damage = 2;
    boost.rate = 1.5;
    const raged = board('eagleartillery', 1, 12);
    advance(raged, 6);
    expect(boost.calls.has('eagleartillery')).toBe(true);
    const plain = neutral.late!.eagleArtillery!.shells[0];
    const boosted = raged.late!.eagleArtillery!.shells[0];
    expect([plain.damage, plain.spellDamage]).toEqual([20, 225]);
    expect([boosted.damage, boosted.spellDamage]).toEqual([40, 450]);
    expect(boosted.launchedAt).toBeLessThan(plain.launchedAt);
  });
  it('scales Scattershot impact and shard damage and its firing rate', () => {
    const neutral = board('scattershot', 1, 5);
    advance(neutral, 4);
    boost.damage = 2;
    boost.rate = 1.5;
    const raged = board('scattershot', 1, 5);
    advance(raged, 4);
    expect(boost.calls.has('scattershot')).toBe(true);
    const plain = neutral.late!.scattershot!.towers[700].shots;
    const boosted = raged.late!.scattershot!.towers[700].shots;
    expect(plain.map((shot) => +shot.at.toFixed(3))).toEqual([0.64, 3.84]);
    expect(boosted[0].at).toBeLessThan(plain[0].at);
    expect(boosted[1].at - boosted[0].at).toBeLessThan(plain[1].at - plain[0].at);
    const taken = (battle: Battle) => 1e6 - battle.units[0].hp;
    const landed = (battle: Battle) => battle.late!.scattershot!.impacts.length;
    expect(landed(neutral)).toBeGreaterThan(0);
    expect(taken(neutral)).toBeCloseTo(403.5 * landed(neutral), 6);
    expect(taken(raged)).toBeCloseTo(2 * 403.5 * landed(raged), 6);
  });
});
