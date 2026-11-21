import { describe, expect, it } from 'vitest';
import catalog from '../reference/full-client/roster.json';
import { SPELL_KEYS, TROOP_KEYS, asset } from '../src/game/data';
import { TROOP_SOURCE } from '../src/game/native-units';
import { SPELL_NAMES } from '../src/game/troop-progression';
import { HERO_KINDS, HERO_SOURCE, heroPortraitImage } from '../src/game/native-hero-data';
import { heroRosterIcon, rosterIcon } from '../src/ui/roster-art';

describe('standalone roster artwork', () => {
  it('binds every player troop and spell to its pinned UI export', () => {
    for (const [category, rows] of [
      ['troop', TROOP_KEYS.map((kind) => [kind, TROOP_SOURCE[kind]] as const)],
      ['spell', SPELL_KEYS.map((kind) => [kind, SPELL_NAMES[kind]] as const)],
    ] as const) {
      for (const [kind, name] of rows) {
        const source = catalog.portraits.find((p) => p.category === category && p.name === name);
        expect(source, kind).toMatchObject({ source: 'sc/ui.sc', frame: 0 });
        if (category === 'spell') {
          expect(source?.artReferences.BigPicture, kind).toBe(source?.exports[0]);
        }
        expect(rosterIcon(kind), kind).toBe(`/${source!.path}`);
      }
    }
  });

  it('binds all six battle hero cards to standalone UI exports', () => {
    for (const kind of HERO_KINDS) {
      const source = catalog.portraits.find(
        (p) => p.category === 'hero' && p.name === HERO_SOURCE[kind],
      );
      expect(source, kind).toMatchObject({ source: 'sc/ui.sc', frame: 0 });
      expect(heroRosterIcon(kind), kind).toBe(`/${source!.path}`);
      expect(heroRosterIcon(kind), kind).not.toBe(heroPortraitImage(kind));
    }
  });

  it('keeps scene assets and non-roster controls separate', () => {
    expect(asset('swordsman')).toBe('/assets/characters/barbarian-v1.webp');
    expect(asset('lightning')).toBe('/assets/spells/lightning-v2.webp');
    expect(rosterIcon('cannon')).toBeUndefined();
  });
});
