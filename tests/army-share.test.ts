import { expect, it } from 'vitest';
import {
  armyFromLink,
  armyLink,
  decodeArmy,
  encodeArmy,
  MAX_ARMY_CODE_LENGTH,
} from '../src/game/army-share';
import { emptyArmy, emptySpells } from '../src/game/army';
import { armyRecipe } from '../src/game/army-recipes';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';

const raw = (value: unknown) => '1.' + Buffer.from(JSON.stringify(value)).toString('base64url');
const body = () => ({ name: 'My army', troops: [['swordsman', 4]], spells: [['rage', 1]] });

it('round trips a real recipe including its ordered heroes, gear and pets', () => {
  const recipe = armyRecipe('EV_TH14_HotHogSummer')!;
  const code = encodeArmy(recipe)!;
  expect(code).toMatch(/^1\.[A-Za-z0-9_-]+$/);
  expect(decodeArmy(code)).toEqual({
    name: recipe.name,
    army: recipe.army,
    spells: recipe.spells,
    heroes: recipe.heroes,
  });
  expect(decodeArmy(code)).not.toHaveProperty('castle');
});

it('round trips a Unicode name and three siege reserves without exporting village progress', () => {
  const preset = {
    name: '龍 🐲',
    army: { ...emptyArmy(), archer: 20, wallwrecker: 2, battleblimp: 1 },
    spells: { ...emptySpells(), freeze: 2 },
  };
  expect(decodeArmy(encodeArmy(preset)!)).toEqual(preset);
  const decoded = decodeArmy(
    raw({ ...body(), gold: 10000000, troopLevels: { swordsman: 99 }, unknown: true }),
  )!;
  expect(Object.keys(decoded).sort()).toEqual(['army', 'name', 'spells']);
});

for (const [label, patch] of [
  ['unknown troop', { troops: [['cannon', 1]] }],
  [
    'duplicate troop',
    {
      troops: [
        ['archer', 1],
        ['archer', 2],
      ],
    },
  ],
  ['negative troop', { troops: [['archer', -1]] }],
  ['fractional troop', { troops: [['archer', 1.5]] }],
  ['excessive troop', { troops: [['archer', 1001]] }],
  ['empty army', { troops: [] }],
  ['unknown spell', { spells: [['bogus', 1]] }],
  [
    'duplicate spell',
    {
      spells: [
        ['rage', 1],
        ['rage', 2],
      ],
    },
  ],
  [
    'four sieges',
    {
      troops: [
        ['wallwrecker', 3],
        ['battleblimp', 1],
      ],
    },
  ],
  ['long name', { name: 'x'.repeat(33) }],
  ['foreign equipment', { heroes: [{ kind: 'king', items: ['archer-puppet'] }] }],
  [
    'duplicate hero',
    {
      heroes: [
        { kind: 'king', items: [] },
        { kind: 'king', items: [] },
      ],
    },
  ],
  [
    'duplicate pet',
    {
      heroes: [
        { kind: 'king', items: [], pet: 'yak' },
        { kind: 'queen', items: [], pet: 'yak' },
      ],
    },
  ],
] as const)
  it(`rejects ${label} without silently changing the composition`, () => {
    expect(decodeArmy(raw({ ...body(), ...patch }))).toBeNull();
  });

it('bounds malformed, non-UTF8 and incompatible codes', () => {
  for (const code of [
    '2.' + raw(body()).slice(2),
    '1.%%%%',
    '1._w',
    '1.' + 'a'.repeat(MAX_ARMY_CODE_LENGTH),
    raw(null),
  ])
    expect(decodeArmy(code)).toBeNull();
});

it('links retain a hosted subpath, discard transient search flags and handle damaged escapes', () => {
  const code = raw(body()),
    link = armyLink('https://example.test/game/?lazyart#old', code);
  expect(new URL(link).pathname).toBe('/game/');
  expect(new URL(link).search).toBe('');
  expect(armyFromLink(link)).toBe(code);
  expect(armyFromLink('https://example.test/#army=%ZZ')).toBe('%ZZ');
  expect(armyFromLink('https://example.test/#layout=1.2')).toBeNull();
});

it('imports only through atomic preparation and leaves village progress unchanged', () => {
  const model = new GameModel(),
    before = structuredClone(model.state);
  const code = raw({ name: 'Small army', troops: [['swordsman', 4]], spells: [] });
  expect(model.useSharedArmy(code)).toBe(true);
  expect(model.state.army.swordsman).toBe(4);
  expect(model.state.troopLevels).toEqual(before.troopLevels);
  for (const key of ['gold', 'elixir', 'dark', 'gems'] as const)
    expect(model.state[key]).toBe(before[key]);
  expect(model.armyShareCode()).toBeTruthy();
  model.saveArmyPreset(0, 'Keep this');
  expect(decodeArmy(model.armyShareCode(0)!)!.name).toBe('Keep this');
  expect(model.armyShareCode(3)).toBeNull();
  expect(model.armyShareCode(1)).toBeNull();
});

it('refuses damaged, over-capacity and locked armies without spending or partially replacing anything', () => {
  const model = new GameModel(),
    before = JSON.stringify(model.state);
  for (const code of [
    'broken',
    raw({ ...body(), spells: [], troops: [['swordsman', 1000]] }),
    raw({ ...body(), spells: [], troops: [['dragon', 1]] }),
  ]) {
    expect(model.useSharedArmy(code)).toBe(false);
    expect(JSON.stringify(model.state)).toBe(before);
  }
  model.startBattle(0, true);
  const during = JSON.stringify(model.state);
  expect(model.useSharedArmy(raw({ ...body(), spells: [] }))).toBe(false);
  expect(model.armyShareCode()).toBeNull();
  expect(JSON.stringify(model.state)).toBe(during);
});

it('shares saved hero order and available equipment while explaining unavailable heroes and pets', () => {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 9),
    makeBuilding(2, 'herohall', 4, 4, 3),
    makeBuilding(3, 'builder', 30, 30),
    makeBuilding(4, 'blacksmith', 8, 4),
    makeBuilding(5, 'camp', 12, 12, 5),
  ];
  model.state.nextId = 10;
  model.state.king = { level: 10 };
  model.state.heroes = { queen: { level: 5 } };
  model.state.army = { ...emptyArmy(), swordsman: 5 };
  model.state.heroLineup = ['queen', 'king'];
  expect(model.equipItem('king', 'earthquake-boots', 0)).toBe(true);
  model.saveArmyPreset(0, 'Heroes');
  const code = model.armyShareCode(0)!;
  model.state.heroLineup = ['king', 'queen'];
  model.equipItem('king', 'barbarian-puppet', 0);
  expect(model.useSharedArmy(code)).toBe(true);
  expect(model.heroLineup).toEqual(['queen', 'king']);
  expect(model.gear.loadouts.king).toEqual(['earthquake-boots', 'rage-vial']);
  expect(validateSave(model.state)).toBe(true);
  const shared = decodeArmy(code)!;
  shared.heroes![0].pet = 'unicorn';
  delete model.state.heroes!.queen;
  const toasts: string[] = [];
  model.onToast = (message) => toasts.push(message);
  expect(model.useSharedArmy(encodeArmy(shared)!)).toBe(true);
  expect(model.heroLineup).toEqual(['king']);
  expect(toasts.join()).toContain('Archer Queen');
  expect(model.state.heroes!.queen).toBeUndefined();
  expect(model.petProgress.levels.unicorn).toBeUndefined();
});
