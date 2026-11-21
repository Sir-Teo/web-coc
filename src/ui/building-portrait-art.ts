const portraitFamilies = new Map([
  ['goldmine', 'gold-mine'],
  ['collector', 'elixir-collector'],
  ['goldstorage', 'gold-storage'],
  ['elixirstorage', 'elixir-storage'],
  ['barracks', 'barracks'],
  ['laboratory', 'laboratory'],
  ['spellfactory', 'spell-factory'],
]);

/** Static source portraits for the HUD. The world renderer owns the animated bodies. */
export function buildingPortrait(kind: string, level: number) {
  const family = portraitFamilies.get(kind);
  return family ? `/assets/catalog-native/${family}/level-${level}.png` : undefined;
}
