import { expect, it } from 'vitest';
import codes from './fixtures/native-army-codes.json' with { type: 'json' };
import { ARMY_RECIPES } from '../src/game/army-recipes';
import { decodeNativeArmyCode } from '../src/game/native-army-code';
import { armyFromLink, decodeArmy, decodeSharedArmy } from '../src/game/army-share';
import { GameModel } from '../src/game/model';

for (const recipe of ARMY_RECIPES)
  it(`decodes the original ${recipe.id} code exactly like the pinned Cookbook catalog`, () => {
    const decoded = decodeNativeArmyCode(codes[recipe.id as keyof typeof codes]);
    expect(decoded).not.toBeNull();
    expect(decoded!.preset.army).toEqual(recipe.army);
    expect(decoded!.preset.spells).toEqual(recipe.spells);
    expect(decoded!.preset.heroes).toEqual(recipe.heroes);
    expect(decoded!.castle).toEqual(recipe.castle);
  });

it('accepts original-game URLs and raw codes through the shared preview boundary', () => {
  const code = codes.EV_TH10_HotHogSummer,
    link = `https://link.clashofclans.com/en?action=CopyArmy&army=${encodeURIComponent(code)}`;
  expect(armyFromLink(link)).toBe(code);
  expect(decodeArmy(code)).toBeNull();
  expect(decodeSharedArmy(armyFromLink(link)!)!.preset.army.hogrider).toBe(16);
  expect(decodeSharedArmy(code)!.notes.join()).toContain('Clan Castle');
});

it('retains the source Warden mode as an explicit preview note instead of silently changing it', () => {
  const decoded = decodeNativeArmyCode('h2m1u4x0')!;
  expect(decoded.modes).toEqual([{ hero: 'warden', mode: 1 }]);
  expect(decodeSharedArmy('h2m1u4x0')!.notes.join()).toContain('ground/air mode');
});

it('uses numeric troop GlobalIDs independently of hero record order', () => {
  const decoded = decodeNativeArmyCode('h6u4x0s1x1')!;
  expect(decoded.preset.heroes).toEqual([{ kind: 'prince', items: [] }]);
  expect(decoded.preset.army.swordsman).toBe(4);
  expect(decoded.preset.spells.heal).toBe(1);
});

for (const code of [
  'u4x51',
  'u0x0',
  'u-1x0',
  'u1.5x0',
  'u1001x0',
  'u1x999999',
  'u1x0-2x0',
  'u1x0u1x0',
  'u1x0s1x999999',
  'u1x0s1x1-1x1',
  'u1x0zgarbage',
  'prefixu1x0',
  'u1x0h',
  'h0-0u1x0',
  'h3u1x0',
  'h999u1x0',
  'h0e2u1x0',
  'h0e999u1x0',
  'h0e0_0u1x0',
  'h0m1u1x0',
  'h2m2u1x0',
  'h0p999u1x0',
  'h0p1-1p1u1x0',
  's1x1',
  'u1x0i1x999999',
  'u' + '1'.repeat(8192),
])
  it(`rejects malformed or unsupported native code ${code.slice(0, 45)}`, () => {
    expect(decodeNativeArmyCode(code)).toBeNull();
    expect(decodeSharedArmy(code)).toBeNull();
  });

it('applies an imported basic army without changing research or balances', () => {
  const model = new GameModel(),
    before = structuredClone(model.state);
  expect(model.useSharedArmy('u4x0')).toBe(true);
  expect(model.state.army.swordsman).toBe(4);
  expect(model.state.troopLevels).toEqual(before.troopLevels);
  for (const key of ['gold', 'elixir', 'dark', 'gems'] as const)
    expect(model.state[key]).toBe(before[key]);
});

it('rejects unavailable source armies atomically and keeps the same live-battle guard', () => {
  const model = new GameModel(),
    before = JSON.stringify(model.state);
  expect(model.useSharedArmy(codes.EV_TH10_HotHogSummer)).toBe(false);
  expect(JSON.stringify(model.state)).toBe(before);
  model.startBattle(0, true);
  const battle = JSON.stringify(model.battle);
  expect(model.useSharedArmy('u4x0')).toBe(false);
  expect(JSON.stringify(model.battle)).toBe(battle);
});
