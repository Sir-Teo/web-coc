import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import source from '../reference/fonts/native.json';
import client from '../reference/full-client/manifest.json';
import { HEADING_FONT, TEXT_FONT } from '../src/ui/fonts';
const root = new URL('../', import.meta.url);
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');

it('pins original font files and every retained SFNT table to the official client', () => {
  for (const [path, pin] of Object.entries(source.sources))
    expect(
      path === 'fingerprint.json'
        ? client.fingerprintSha256
        : client.files.find((f) => f.path === path)?.sha256,
    ).toBe(pin);
  for (const record of source.fonts) {
    const original = readFileSync(new URL(record.original, root));
    expect(hash(original)).toBe(source.sources[record.source]);
    expect(original.length).toBe(record.sourceBytes);
    const tables = new Map<string, Buffer>();
    for (let i = 0; i < original.readUInt16BE(4); i++) {
      const at = 12 + i * 16;
      const tag = original.toString('ascii', at, at + 4);
      tables.set(
        tag,
        original.subarray(
          original.readUInt32BE(at + 8),
          original.readUInt32BE(at + 8) + original.readUInt32BE(at + 12),
        ),
      );
    }
    expect(tables.get('maxp')!.readUInt16BE(4)).toBe(record.glyphs);
    expect(tables.get('head')!.readUInt16BE(18)).toBe(record.unitsPerEm);
    expect(tables.get('OS/2')!.readUInt16BE(4)).toBe(record.weight);
    for (const [tag, pin] of Object.entries(record.tables))
      expect(hash(tables.get(tag)!)).toBe(pin);
    const encoded = readFileSync(new URL('public/' + record.path, root));
    expect(hash(encoded)).toBe(record.sha256);
    expect(encoded.toString('ascii', 0, 4)).toBe('wOF2');
    expect(encoded.readUInt32BE(8)).toBe(encoded.length);
    expect(encoded.readUInt16BE(12)).toBe(tables.size);
    expect(encoded.length).toBe(record.bytes);
  }
});
it('retains full English HUD font families, printable ASCII and all source glyphs', () => {
  expect(source.encoding.subset).toBe(false);
  expect(source.hudFonts).toEqual({ 'CCBackBeat Light': 7, 'Supercell-Magic': 18 });
  expect(source.englishLocale).toEqual({ name: 'EN', forcedFontName: '', usedSystemFont: '' });
  expect(source.fonts.map((f) => f.family)).toEqual([HEADING_FONT, TEXT_FONT]);
  expect(source.fonts.reduce((n, f) => n + f.glyphs, 0)).toBe(786);
  for (const record of source.fonts)
    for (let code = 32; code < 127; code++) expect(record.codePoints).toContain(code);
});
