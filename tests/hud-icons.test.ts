import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { hasIcon } from '../src/ui/icons';
import { EQUIPMENT } from '../src/game/equipment';

// Unregistered glyph names used to fall back to a circle silently.
describe('HUD icons', () => {
  const hud = fs.readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
  const names = new Set<string>();
  for (const match of hud.matchAll(/icon\('([A-Za-z0-9]+)'/g)) names.add(match[1]);
  // Stat and research rows name their glyph as the first tuple entry.
  for (const match of hud.matchAll(/\[\s*'([A-Z][A-Za-z0-9]+)',\s*'/g)) names.add(match[1]);
  for (const match of hud.matchAll(/^\s*'([A-Z][a-z]+[A-Z][A-Za-z]+)',$/gm)) names.add(match[1]);

  // Tuples that start with a capitalised word but are labels, not glyphs.
  for (const label of ['All', 'Walls', 'Damage']) names.delete(label);
  it('registers every glyph the HUD names', () => {
    expect(names.size).toBeGreaterThan(40);
    expect([...names].filter((name) => !hasIcon(name))).toEqual([]);
  });
  it('registers equipment quest glyphs', () => {
    const glyphs = Object.values(EQUIPMENT).map((e) => (e as { icon?: string }).icon);
    expect(glyphs.filter((g) => g && !hasIcon(g))).toEqual([]);
  });
});
