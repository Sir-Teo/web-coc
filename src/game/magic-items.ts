/**
 * Magic items held in the village. Hero's Journey hands them out; the full catalog, its
 * stack limits and the Trader arrive with the client's magic item tables. Until then an
 * item is only usable where a source here states its effect: Book of Heroes finishes a hero
 * upgrade (reference/official-wiki/heroes-pets/hero-hall.md). The rest are kept, not used.
 */
export const MAGIC_ITEMS = {
  'book-of-heroes': {
    name: 'Book of Heroes',
    description: 'Finishes a hero upgrade instantly.',
    usable: true,
  },
  'hero-potion': {
    name: 'Hero Potion',
    description: 'Boosts your heroes for battle. Kept until potions arrive.',
    usable: false,
  },
  'pet-potion': {
    name: 'Pet Potion',
    description: 'Boosts your pets for battle. Kept until potions arrive.',
    usable: false,
  },
  'mighty-morsel': {
    name: 'Mighty Morsel',
    description: 'A Hero’s Journey treat. Kept until its effect arrives with the client data.',
    usable: false,
  },
  'rune-of-elixir': {
    name: 'Rune of Elixir',
    description: 'Fills Elixir storage. Kept until runes arrive with the client data.',
    usable: false,
  },
  'rune-of-dark-elixir': {
    name: 'Rune of Dark Elixir',
    description: 'Fills Dark Elixir storage. Kept until runes arrive with the client data.',
    usable: false,
  },
} as const;
export type MagicItemKind = keyof typeof MAGIC_ITEMS;
export const MAGIC_ITEM_KINDS = Object.keys(MAGIC_ITEMS) as MagicItemKind[];
/** A generous ceiling for saved counts until the client's stack limits are imported. */
export const MAX_MAGIC_ITEMS = 99;
export type MagicItems = Partial<Record<MagicItemKind, number>>;

export const magicItemKind = (name: string) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, '-') as MagicItemKind;
export const validMagicItem = (kind: unknown): kind is MagicItemKind =>
  typeof kind === 'string' && Object.hasOwn(MAGIC_ITEMS, kind);
export const validMagicItems = (value: unknown): value is MagicItems =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.entries(value).every(
    ([kind, count]) =>
      validMagicItem(kind) && Number.isInteger(count) && count >= 0 && count <= MAX_MAGIC_ITEMS,
  );
