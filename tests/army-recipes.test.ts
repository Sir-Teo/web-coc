import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { armySpace, spellSpace } from '../src/game/army';
import {
  ARMY_RECIPES,
  ARMY_RECIPE_TEXTS,
  FIRST_RECIPE_TOWN_HALL,
  armyRecipe,
  armyRecipesFor,
} from '../src/game/army-recipes';
import { BUILDINGS, type BuildingKind } from '../src/game/data';
import { validateSave } from '../src/game/save';

/** The kinds a record holds, with their counts. */
const held = (record: Record<string, number>) =>
  Object.fromEntries(Object.entries(record).filter(([, n]) => n));

/** A village at `townhall` whose army buildings are complete and whose camps hold `space`. */
function village(townhall: number, space = 400) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.townhall!.level = townhall;
  const kinds: BuildingKind[] = [
    'barracks',
    'darkbarracks',
    'spellfactory',
    'darkspellfactory',
    'workshop',
  ];
  m.state.buildings = m.state.buildings.filter((b) => !kinds.includes(b.kind) && b.kind !== 'camp');
  let x = 2;
  for (const kind of kinds) {
    m.state.buildings.push(makeBuilding(m.state.nextId++, kind, x, 30, BUILDINGS[kind].maxLevel));
    x += 5;
  }
  // Camps side by side on their own row, so the village stays a valid save.
  const camp = BUILDINGS.camp.maxLevel;
  for (let at = 2; m.capacity < space; at += 5)
    m.state.buildings.push(makeBuilding(m.state.nextId++, 'camp', at, 36, camp));
  return m;
}

describe('army recipes', () => {
  it('decodes every recipe the client ships, Town Halls 10 to 17', () => {
    expect(ARMY_RECIPES).toHaveLength(37);
    expect(FIRST_RECIPE_TOWN_HALL).toBe(10);
    for (let th = 10; th <= 17; th++) expect(armyRecipesFor(th).length).toBeGreaterThan(0);
    expect(armyRecipesFor(9)).toEqual([]);
    expect(ARMY_RECIPE_TEXTS).toMatchObject({
      tab: 'Cookbook',
      loaded: 'Recipe <army> set as active army!',
      cannotTrain: 'You cannot train this army',
    });
  });

  it('reads Hot Hog Summer at Town Hall 10 as the client’s army code spells it', () => {
    // h0e14_8-1e48_2 i1x51-7x26 d1x5 u16x11-16x12-8x6 s3x1-2x2-1x5
    const recipe = armyRecipe('EV_TH10_HotHogSummer')!;
    expect(recipe).toMatchObject({
      name: 'Hot Hog Summer',
      creator: 'Hog Rider',
      townHall: [10, 10],
    });
    expect(held(recipe.army)).toEqual({ hogrider: 16, valkyrie: 16, wizard: 8 });
    expect(held(recipe.spells)).toEqual({ heal: 3, rage: 2, freeze: 1 });
    expect(armySpace(recipe.army)).toBe(240);
    expect(spellSpace(recipe.spells)).toBe(11);
    expect(recipe.heroes).toEqual([
      { kind: 'king', items: ['spiky-ball', 'earthquake-boots'] },
      { kind: 'queen', items: ['action-figure', 'archer-puppet'] },
    ]);
    expect(recipe.castle).toEqual({
      troops: [
        ['wallwrecker', 1],
        ['superbarbarian', 7],
      ],
      spells: [['freeze', 1]],
    });
  });

  it('keeps pets on the heroes that bring them', () => {
    const recipe = armyRecipe('EV_TH14_HotHogSummer')!;
    expect(recipe.heroes.map((h) => [h.kind, h.pet])).toEqual([
      ['king', 'yak'],
      ['queen', 'unicorn'],
      ['warden', 'owl'],
      ['champion', 'lassi'],
    ]);
  });

  it('makes a recipe the active army and says so in the client’s words', () => {
    const m = village(10);
    const toasts: string[] = [];
    m.onToast = (message) => toasts.push(message);
    expect(m.armyRecipes.map((r) => r.name)).toContain('Hot Hog Summer');
    m.train('swordsman');
    expect(m.useArmyRecipe('EV_TH10_HotHogSummer')).toBe(true);
    const recipe = armyRecipe('EV_TH10_HotHogSummer')!;
    expect(m.state.army).toEqual(recipe.army);
    expect(m.state.spells).toEqual(recipe.spells);
    expect(m.state.queue).toEqual([]);
    expect(toasts.at(-1)).toMatch(/^Recipe Hot Hog Summer set as active army! /);
    // Heroes this village lacks are left out, and the message says so.
    expect(toasts.at(-1)).toContain('Barbarian King is not in this village');
  });

  it('refuses a recipe the village cannot train, leaving the army as it was', () => {
    const m = village(10);
    for (const b of m.state.buildings) if (b.kind === 'camp') b.level = 1;
    const toasts: string[] = [];
    m.onToast = (message) => toasts.push(message);
    m.train('swordsman');
    const before = structuredClone(m.state.army);
    expect(m.useArmyRecipe('EV_TH10_HotHogSummer')).toBe(false);
    expect(m.state.army).toEqual(before);
    expect(toasts.at(-1)).toBe(
      'You cannot train this army. This army needs more troop or spell housing.',
    );
    // Only the recipes of the village's own Town Hall can be used.
    expect(m.useArmyRecipe('EV_TH11_HotHogSummer')).toBe(false);
  });

  it('saves a recipe as a Quick army, in the first empty slot or over a chosen one', () => {
    const m = village(10);
    const toasts: string[] = [];
    m.onToast = (message) => toasts.push(message);
    m.train('swordsman');
    m.saveArmyPreset(0, 'Mine');
    expect(m.saveArmyRecipe('EV_TH10_HotHogSummer')).toBe(true);
    const recipe = armyRecipe('EV_TH10_HotHogSummer')!;
    expect(m.state.armyPresets![1]).toEqual({
      name: 'Hot Hog Summer',
      army: recipe.army,
      spells: recipe.spells,
      heroes: recipe.heroes,
    });
    expect(toasts.at(-1)).toBe('Hot Hog Summer saved as Quick army 2.');
    expect(validateSave(m.state)).toBe(true);
    // Loading it later sets the recipe's army.
    m.clearArmy();
    m.loadArmyPreset(1);
    expect(m.state.army).toEqual(recipe.army);
    // With every slot full, Save needs a slot, and saving over one can be undone.
    m.saveArmyRecipe('EV_TH10_June2025');
    expect(m.saveArmyRecipe('EV_TH10_SeptemberWitches')).toBe(false);
    expect(toasts.at(-1)).toMatch(/All three Quick army slots are full/);
    expect(m.saveArmyRecipe('EV_TH10_SeptemberWitches', 0)).toBe(true);
    expect(m.state.armyPresets![0]!.name).toBe('Wicked Witches');
    expect(m.undoSlot('preset', 0)).toBe(true);
    expect(m.state.armyPresets![0]!.name).toBe('Mine');
  });
});
