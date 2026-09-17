import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import sharp from 'sharp';
import { HERO_KINDS, heroPortraitImage } from '../src/game/native-hero-data';
import { bakedFrame, heroArtDirectory, type BakedState } from '../src/game/hero-native-scene';

describe('matching custom hero artwork', () => {
  for (const kind of HERO_KINDS)
    it(`${kind} ships transparent portraits and complete directional animation`, async () => {
      const directory = `public${heroArtDirectory(`heroes-native/${kind}`)}`;
      const atlas = JSON.parse(fs.readFileSync(`${directory}/atlas.json`, 'utf8')) as {
        scale: number;
        normalizedAttack: boolean;
        states: Record<string, BakedState>;
      };
      expect(atlas.scale).toBeGreaterThan(0);
      expect(atlas.normalizedAttack).toBe(true);
      const portrait = await sharp(`public${heroPortraitImage(kind)}`).stats();
      expect(portrait.channels[3].min).toBe(0);
      expect(portrait.channels[3].max).toBeGreaterThan(240);
      for (const name of ['idle', 'walk', 'attack', 'die']) {
        const state = atlas.states[name];
        expect(state.frames).toHaveLength(8);
        for (const frames of state.frames)
          for (const frame of frames) {
            const image = await sharp(`${directory}/${frame.image}`).metadata();
            expect(frame.x + frame.w).toBeLessThanOrEqual(image.width!);
            expect(frame.y + frame.h).toBeLessThanOrEqual(image.height!);
            expect(frame.anchorY).toBe(216);
          }
      }
      // A fresh hit begins with the strike; the next windup anticipates the next hit.
      expect(bakedFrame(atlas.states.attack, 0, 0)).not.toEqual(
        bakedFrame(atlas.states.attack, 0, 0.9),
      );
      expect(atlas.states.walk.frames[0].length).toBeGreaterThanOrEqual(4);
    });

  it('leaves pets and guardians on their native animation packs', () => {
    expect(heroArtDirectory('heroes-native/unicorn')).toBe('/assets/heroes-native/unicorn');
    expect(heroArtDirectory('guardians-native/longshot')).toBe('/assets/guardians-native/longshot');
  });
});
