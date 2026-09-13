import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import audio from '../reference/archer-tower/sounds.json';
import source from '../reference/archer-tower/native.json';
it('retains every original Archer Tower effect sample and source audio row', () => {
  expect(audio.definitionSha256).toBe(
    createHash('sha256').update(readFileSync('reference/archer-tower/native.json')).digest('hex'),
  );
  const effects = Object.fromEntries(
    Object.entries(source.effects).filter(([, rows]) => rows.some((r) => r.Sound)),
  );
  expect(audio.effects).toEqual(effects);
  expect(Object.keys(audio.sounds)).toHaveLength(9);
  const required = new Set(
    Object.values(effects).flatMap((rows) => rows.flatMap((r) => (r.Sound ? [r.Sound] : []))),
  );
  expect(new Set(Object.keys(audio.sounds))).toEqual(required);
  for (const sample of Object.values(audio.sounds)) {
    const bytes = readFileSync(`public/${sample.path}`);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(bytes.length).toBe(sample.bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sample.sha256);
  }
});
