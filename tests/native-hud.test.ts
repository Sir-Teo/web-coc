import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import hud from '../reference/hud/native.json';
import client from '../reference/full-client/manifest.json';

it('retains the pinned original campaign map pose and decoded RGBA pixels', async () => {
  for (const [path, hash] of Object.entries(hud.sources))
    expect(client.files.find((file) => file.path === path)?.sha256).toBe(hash);
  expect([
    hud.export,
    hud.exportId,
    hud.childSlot,
    hud.childName,
    hud.clipId,
    hud.frame,
    hud.label,
  ]).toEqual(['hud_button_fight', 217, 2, 'icon', 201, 0, 'no_stars']);
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  expect([hud.background.childSlot, hud.background.childName, hud.background.shapeId]).toEqual([
    0,
    '',
    55,
  ]);
  for (const asset of [hud, hud.background]) {
    const png = readFileSync(new URL('../public/' + asset.path, import.meta.url));
    expect(png.length).toBe(asset.bytes);
    expect(hash(png)).toBe(asset.sha256);
    const { data, info } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([asset.width, asset.height, 4]);
    expect(hash(data)).toBe(asset.rgbaSha256);
  }
});
