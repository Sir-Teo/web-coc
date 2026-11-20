const portraitFamilies = new Map([
  ['goldmine', 'gold-mine'],
  ['collector', 'elixir-collector'],
  ['goldstorage', 'gold-storage'],
  ['elixirstorage', 'elixir-storage'],
]);

/** Static source portraits for the HUD. The world renderer owns the animated bodies. */
export function resourceBuildingPortrait(kind: string, level: number) {
  const family = portraitFamilies.get(kind);
  return family ? `/assets/catalog-native/${family}/level-${level}.png` : undefined;
}
