import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import portraits from '../reference/archer-tower/portraits.json';
import definitions from '../reference/archer-tower/native.json';
import { archerTowerPortrait } from '../src/ui/archer-tower-portrait';
import { archerTowerComposition } from '../src/game/archer-tower-art';
import { nativeVertices } from '../src/game/native-mesh';

it('binds every portrait to original source graphics and the live rooftop composition', async () => {
  for (const [name, hash] of Object.entries(portraits.sourceSha256))
    expect(
      createHash('sha256')
        .update(readFileSync(`reference/archer-tower/${name}`))
        .digest('hex'),
    ).toBe(hash);
  expect(portraits.portraits.map((p) => p.level)).toEqual(
    Array.from({ length: 21 }, (_, i) => i + 1),
  );
  for (const portrait of portraits.portraits) {
    const row = definitions.levels[portrait.level - 1];
    expect(portrait.bodyExport).toBe(row.ExportName);
    expect(portrait.baseExport).toBe(row.ExportNameBase);
    expect(portrait.residentRoot).toEqual([1, 0, 0, 0, 1, 60 - Number(row.DefenderZ) * 0.5]);
    const composition = archerTowerComposition(portrait.level, 'ready', 0);
    const pending = [...composition.body, ...composition.residents];
    const xs: number[] = [],
      ys: number[] = [];
    while (pending.length) {
      const pose = pending.pop()!;
      if ('group' in pose) {
        pending.push(...pose.group);
        continue;
      }
      const vertices = nativeVertices(pose);
      for (let i = 0; i < vertices.length; i += 4) {
        xs.push(vertices[i]);
        ys.push(vertices[i + 1]);
      }
    }
    expect(portrait.bounds).toEqual([
      Math.floor(Math.min(...xs)) - 2,
      Math.floor(Math.min(...ys)) - 2,
      Math.ceil(Math.max(...xs)) + 2,
      Math.ceil(Math.max(...ys)) + 2,
    ]);
    const { data, info } = await sharp(`public/${portrait.path}`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([portrait.width, portrait.height]);
    expect(portrait.width).toBe((portrait.bounds[2] - portrait.bounds[0]) * 2);
    expect(portrait.height).toBe((portrait.bounds[3] - portrait.bounds[1]) * 2);
    expect(createHash('sha256').update(data).digest('hex')).toBe(portrait.rgbaSha256);
    expect(archerTowerPortrait(portrait.level)).toBe('/' + portrait.path);
  }
});
it('rejects missing tiers instead of substituting another tower portrait', () => {
  for (const level of [0, 22, 1.5, NaN]) expect(() => archerTowerPortrait(level)).toThrow();
});
