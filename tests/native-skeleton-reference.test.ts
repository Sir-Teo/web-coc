import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import native from '../reference/skeleton-trap/native.json';
import pumpkin from '../reference/pumpkin-bomb/native.json';

it('preserves native spawn counts, levels, timers and seasonal source identity', () => {
  // The trap shares the Pumpkin Bomb's art sources and pins its spawned characters too.
  expect(native.sources).toEqual({
    ...pumpkin.sources,
    'logic/characters.csv': '5c3acc5b46ff9e7978f406b540264e65c93a846b69d03cd43326a9853703cb89',
  });
  expect(native.spawned.ground.map((r) => [r.level, r.hp, r.dps])).toEqual([
    [1, 30, 25],
    [2, 45, 30],
  ]);
  expect(native.spawned.air.map((r) => [r.level, r.hp, r.dps])).toEqual([
    [1, 30, 25],
    [2, 45, 30],
  ]);
  expect(native.rows.map((r) => [+r.Level, +r.NumSpawns, +r.SpawnLvl])).toEqual([
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 1],
    [4, 5, 1],
    [5, 5, 2],
  ]);
  expect(native.rows[0]).toMatchObject({
    GlobalID: '12000008',
    SpawnInitialDelayMs: '600',
    TimeBetweenSpawnsMs: '150',
    TriggerRadius: '500',
  });
  expect(native.rows[2]).toMatchObject({
    BuildCost: '400000',
    BuildTimeH: '8',
    TownHallLevel: '9',
  });
  expect(native.rows[3]).toMatchObject({
    BuildCost: '1000000',
    BuildTimeH: '12',
    TownHallLevel: '10',
  });
  expect(native.supportedLevels).toEqual([1, 2, 3, 4, 5]);
});

it.each([1, 3, 5] as const)(
  'retains tier %i native pixels, complete timelines and registered thumbnails',
  async (tier) => {
    const { atlas, clips, frames } = native.tiers[tier];
    const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    const file = `public/${atlas.path}`;
    expect(digest(await sharp(file).raw().toBuffer())).toBe(atlas.rgbaSha256);
    // The level 5 coffin dedupes to three more unique cells than the two tiers before it.
    expect(frames).toHaveLength(tier === 5 ? 38 : 35);
    for (const [state, c] of Object.entries(clips)) {
      expect(c.fps).toBe(24);
      expect(c.frames).toHaveLength(state.endsWith('trigger') ? 43 : 35);
      expect(c.count).toBe(c.frames.length);
      expect(c.frames.every((n) => n >= 0 && n < frames.length)).toBe(true);
    }
    for (const frame of frames) {
      const image = sharp(file).extract({
        left: (frame.index % atlas.columns) * atlas.width,
        top: Math.floor(frame.index / atlas.columns) * atlas.height,
        width: atlas.width,
        height: atlas.height,
      });
      expect(digest(await image.raw().toBuffer())).toBe(frame.rgbaSha256);
      if (frame.alphaBounds) {
        const [left, top, right, bottom] = frame.alphaBounds;
        expect(
          Math.min(left, top, atlas.width - right, atlas.height - bottom),
        ).toBeGreaterThanOrEqual(3);
      }
    }
    for (const state of ['ground', 'air', 'spent'] as const) {
      const image = sharp(`public/assets/buildings/skeleton-trap-native/${tier}-${state}.png`);
      expect(digest(await image.raw().toBuffer())).toBe(frames[clips[state].frames[0]].rgbaSha256);
    }
    expect(clips.ground.frames[0]).not.toBe(clips.air.frames[0]);
  },
);
