import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import source from '../reference/santa-trap/native.json';
import campaign from '../reference/campaign/provenance.json';
import runtime from '../reference/santa-trap/runtime.json';

const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');

it('keeps compact runtime geometry exact, including the native sack-tipping shear', () => {
  const clips = Object.values(source.groups.sleigh.clips);
  for (const [i, frame] of source.tracks.sleigh.frames.entries()) {
    expect(runtime.flight[i]).toEqual(
      frame.map((p) => [
        clips.find((c) => c.id === p.id)!.frames[p.frame],
        ...p.matrix,
        p.multiply[3],
      ]),
    );
  }
  expect(runtime.flight[114][1][4]).toBe(0.1728515625);
  for (const name of Object.keys(source.groups) as (keyof typeof source.groups)[]) {
    const original = source.groups[name],
      compact = runtime.groups[name];
    expect(compact.frames).toEqual(original.frames.map((f) => [f.page, f.cell]));
    expect(compact.bounds).toEqual(original.bounds);
  }
});

it('retains the trap, called spell and legacy spell as distinct native records', () => {
  expect(source.sources['logic/traps.csv']).toBe(campaign.sources['logic/traps.csv']);
  expect(source.trap).toMatchObject({
    GlobalID: '12000007',
    Spell: 'Santas Surprise',
    Damage: '0',
    DamageRadius: '0',
    TriggerRadius: '150',
    GroundTrigger: 'TRUE',
    AirTrigger: 'FALSE',
    Passable: 'TRUE',
    ActionFrame: '44',
  });
  expect(source.spell[0]).toMatchObject({
    GlobalID: '26000006',
    Damage: '180',
    Radius: '150',
    RandomRadius: '100',
    NumberOfHits: '5',
    DeployTimeMS: '0',
    ChargingTimeMS: '4500',
    HitTimeMS: '6000',
    TimeBetweenHitsMS: '100',
  });
  expect(source.legacySpell[0]).toMatchObject({
    GlobalID: '26000004',
    Damage: '300',
    Radius: '100',
    RandomRadius: '400',
  });
  expect(source.spell).toHaveLength(13);
  expect(source.groups.trap.clips.trigger).toMatchObject({
    count: 44,
    fps: 24,
    labels: [
      { frame: 0, name: 'Init' },
      { frame: 19, name: 'Ignite' },
    ],
  });
  expect(source.particles.xmas_anim[0]).toMatchObject({
    ParticleExportName: 'xmas_spell',
    MinLife: '10000',
    MaxLife: '10000',
    StartZ: '600',
    ScaleTimeline: 'TRUE',
  });
  expect(source.reconstruction.nativePlaybackVerified).toBe(false);
  expect(source.reconstruction.spellEngineVerified).toBe(false);
});

it('preserves sleigh root motion, alpha, component changes and valid nested phases', () => {
  const track = source.tracks.sleigh;
  expect(track).toMatchObject({ id: 17307, fps: 24, count: 320 });
  expect(track.frames).toHaveLength(320);
  expect(track.frames[0].every((p) => p.multiply[3] === 0)).toBe(true);
  expect(track.frames[1][0].matrix).toEqual([1, 0, 899.1000366210938, 0, 1, 681.5]);
  expect(track.frames[108][0].matrix[2]).toBeCloseTo(89.4, 4);
  expect(track.frames.at(-1)!.map((p) => p.id)).toEqual([17302, 17306]);
  const clips = Object.values(source.groups.sleigh.clips);
  for (const frame of track.frames)
    for (const p of frame) {
      const clip = clips.find((c) => c.id === p.id)!;
      expect(clip).toBeDefined();
      expect(p.frame).toBeGreaterThanOrEqual(0);
      expect(p.frame).toBeLessThan(clip.count);
      expect(p.matrix.every(Number.isFinite)).toBe(true);
      expect(p.add).toEqual([0, 0, 0, 0]);
    }
});

it('retains exact native atlas pixels, bounded textures, every timeline frame and transparent margins', async () => {
  for (const group of Object.values(source.groups)) {
    const pages = await Promise.all(
      group.pages.map(async (page) => {
        const decoded = await sharp(`public/${page.path}`)
          .raw()
          .toBuffer({ resolveWithObject: true });
        expect(decoded.info.channels).toBe(4);
        expect(Math.max(decoded.info.width, decoded.info.height)).toBeLessThanOrEqual(4096);
        expect(digest(decoded.data)).toBe(page.rgbaSha256);
        return decoded;
      }),
    );
    const frameHashes = new Set<string>();
    for (const frame of group.frames) {
      const page = pages[frame.page];
      const pixels = await sharp(page.data, { raw: page.info })
        .extract({
          left: (frame.cell % group.columns) * group.width,
          top: Math.floor(frame.cell / group.columns) * group.height,
          width: group.width,
          height: group.height,
        })
        .raw()
        .toBuffer();
      expect(digest(pixels)).toBe(frame.rgbaSha256);
      frameHashes.add(frame.rgbaSha256);
      if (frame.alphaBounds) {
        const [l, t, r, b] = frame.alphaBounds;
        expect(Math.min(l, t, group.width - r, group.height - b)).toBeGreaterThanOrEqual(2);
      }
    }
    expect(frameHashes.size).toBe(group.frames.length);
    for (const clip of Object.values(group.clips)) {
      expect(clip.frames).toHaveLength(clip.count);
      expect(clip.frames.every((f) => f >= 0 && f < group.frames.length)).toBe(true);
    }
  }
});

it('ships the native setup/spent previews and four unchanged Ogg sources', async () => {
  for (const state of ['setup', 'spent'] as const) {
    const index = source.groups.trap.clips[state].frames[0];
    const pixels = await sharp(`public/assets/effects/santa-native/${state}.png`).raw().toBuffer();
    expect(digest(pixels)).toBe(source.groups.trap.frames[index].rgbaSha256);
  }
  for (const sound of Object.values(source.sounds)) {
    const data = await readFile(`public/${sound.path}`);
    expect(data.subarray(0, 4).toString()).toBe('OggS');
    expect(digest(data)).toBe(sound.sha256);
  }
});
