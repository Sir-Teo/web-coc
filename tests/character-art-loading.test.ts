import { beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => vi.resetModules());

it('loads shared death and projectiles without declaring any body ready', async () => {
  const art = await import('../src/game/character-art');
  expect(art.characterArtLoaded()).toBe(false);
  await art.loadCharacterArt(new Set());
  expect(art.characterArtLoaded()).toBe(true);
  expect(art.characterArtLoaded('Archer9')).toBe(false);
  expect(Object.keys(art.characterArts())).toEqual([]);
  expect(art.commonDeathArt()).toMatchObject({ prefix: 'garrison-dragonDeath', shadows: [45] });
  expect(art.projectileArt('unused-name', 'sc/characters.sc').prefix).toBe(
    'character-projectiles-characters',
  );
});

it('extends selected bodies and resolves aliases to the same graph entry', async () => {
  const art = await import('../src/game/character-art');
  await Promise.all([
    art.loadCharacterArt(new Set(['GolemSmall_lvl6'])),
    art.loadCharacterArt(new Set(['Archer9'])),
  ]);
  expect(Object.keys(art.characterArts())).toEqual(['Archer9', 'Golem_lvl6']);
  expect(art.characterArt('GolemSmall_lvl6')).toBe(art.characterArt('Golem_lvl6'));
  expect(art.characterArtLoaded('GolemSmall_lvl6')).toBe(true);
  expect(art.characterArtLoaded('Dragon7')).toBe(false);
  expect(() => art.characterArt('Dragon7')).toThrow('Missing native character art');
});

it('an explicit full preload completes every body while retaining selected entries and catalog order', async () => {
  const art = await import('../src/game/character-art');
  await art.loadCharacterArt(new Set(['Archer9']));
  const archer = art.characterArt('Archer9');
  const death = art.commonDeathArt();
  await Promise.all([art.loadCharacterArt(), art.loadCharacterArt(new Set(['Dragon7']))]);
  const names = Object.keys(art.characterArts());
  expect(names).toHaveLength(22);
  expect(names[0]).toBe('Dragon7');
  expect(names.at(-1)).toBe('Defending Builder');
  expect(art.characterArt('Archer9')).toBe(archer);
  expect(art.commonDeathArt()).toBe(death);
  expect(art.characterArtLoaded('BalloonGoblin8')).toBe(true);
});
