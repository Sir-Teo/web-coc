import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { expect, it } from 'vitest';
import source from '../reference/pumpkin-bomb/native.json';
import campaign from '../reference/campaign/provenance.json';

it('preserves the native trap identity and both independent timing facts', () => {
  expect(source.sources['logic/traps.csv']).toBe(campaign.sources['logic/traps.csv']);
  expect(source.trap).toMatchObject({
    GlobalID: '12000003',
    Damage: '25',
    TriggerRadius: '150',
    DamageRadius: '300',
    ActionFrame: '48',
    GroundTrigger: 'TRUE',
    AirTrigger: 'FALSE',
    Passable: 'TRUE',
  });
  expect(source.clips.bomp_trap_halloween).toMatchObject({
    fps: 24,
    count: 44,
    labels: [
      { frame: 0, name: 'Init' },
      { frame: 19, name: 'Ignite' },
    ],
  });
  expect(source.reconstruction.nativePlaybackVerified).toBe(false);
});

it('ships every registered native frame with exact RGBA pixels and clear padding', async () => {
  const { atlas, frames } = source;
  const file = `public/${atlas.path}`;
  const metadata = await sharp(file).metadata();
  expect(metadata.hasAlpha).toBe(true);
  expect([metadata.width, metadata.height]).toEqual([
    atlas.width * atlas.columns,
    atlas.height * Math.ceil(atlas.frames / atlas.columns),
  ]);
  const digest = (data: Buffer) => createHash('sha256').update(data).digest('hex');
  expect(digest(await sharp(file).raw().toBuffer())).toBe(atlas.rgbaSha256);
  expect(frames).toHaveLength(45);
  expect(frames[1].alphaBounds).toBeNull(); // Native Init frame is intentionally empty.
  for (const frame of frames) {
    const pixels = await sharp(file)
      .extract({
        left: (frame.index % atlas.columns) * atlas.width,
        top: Math.floor(frame.index / atlas.columns) * atlas.height,
        width: atlas.width,
        height: atlas.height,
      })
      .raw()
      .toBuffer();
    expect(digest(pixels)).toBe(frame.rgbaSha256);
    if (frame.alphaBounds) {
      const [left, top, right, bottom] = frame.alphaBounds;
      expect(
        Math.min(left, top, atlas.width - right, atlas.height - bottom),
      ).toBeGreaterThanOrEqual(2);
    }
  }
});
