import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { makeBuilding, makeNpcBuilding } from '../../src/game/model';
import { REPLAY_VERSION, type ReplayData } from '../../src/game/replay';

/** Supported-entity replay fixture; the real Cross and Bows layout remains gated. */
export function darkLootReplay(): ReplayData {
  return {
    version: REPLAY_VERSION,
    initial: {
      catalog: 'goblin-v1',
      index: 51,
      practice: false,
      buildings: [
        makeBuilding(1000, 'darkstorage', 10, 10, 13),
        makeNpcBuilding(1001, 'goblin-townhall', 20, 20),
      ],
      army: { ...emptyArmy(), pekka: 1 },
      spells: emptySpells(),
      troopLevels: Object.fromEntries(Object.keys(emptyArmy()).map((k) => [k, 1])) as ReturnType<
        typeof emptyArmy
      >,
      spellLevels: defaultSpellLevels(),
      nextId: 10,
      availableLoot: { gold: 0, elixir: 0, dark: 1250 },
      lootRoom: { gold: 0, elixir: 0, dark: 700 },
    },
    steps: Array(1200).fill(0.05),
    actions: [
      { step: 0, type: 'troop', kind: 'pekka', x: 7, y: 10 },
      { step: 1200, type: 'end' },
    ],
  };
}
