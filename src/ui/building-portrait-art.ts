const portraitFamilies = new Map([
  ['townhall', 'town-hall'],
  ['goldmine', 'gold-mine'],
  ['collector', 'elixir-collector'],
  ['goldstorage', 'gold-storage'],
  ['elixirstorage', 'elixir-storage'],
  ['barracks', 'barracks'],
  ['laboratory', 'laboratory'],
  ['spellfactory', 'spell-factory'],
  ['herohall', 'hero-hall'],
  ['blacksmith', 'blacksmith'],
  ['airdefense', 'air-defense'],
  ['bomb', 'bomb'],
  ['giantbomb', 'giant-bomb'],
  ['airbomb', 'air-bomb'],
  ['springtrap', 'spring-trap'],
]);

/** Static source portraits for the HUD. The world renderer owns the animated bodies. */
export function buildingPortrait(kind: string, level: number) {
  if (kind === 'builder' && level >= 1 && level <= 4)
    return `/assets/catalog-native/builders-hut/level-${level}.png`;
  const family = portraitFamilies.get(kind);
  return family ? `/assets/catalog-native/${family}/level-${level}.png` : undefined;
}
