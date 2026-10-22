import { expect, it } from 'vitest';
import fs from 'node:fs';
import roster from '../reference/full-client/roster.json';

it('ships every declared roster portrait with its recorded PNG dimensions', () => {
  expect(
    roster.portraits.filter((row) => !fs.existsSync('public/' + row.path)).map((row) => row.path),
  ).toEqual([]);
  for (const row of roster.portraits) {
    const png = fs.readFileSync('public/' + row.path);
    expect(png.subarray(0, 8).toString('hex'), row.path).toBe('89504e470d0a1a0a');
    expect(png.readUInt32BE(16), row.path).toBe(row.width);
    expect(png.readUInt32BE(20), row.path).toBe(row.height);
  }
});

it('publishes the same source records in the browsable roster catalog', () => {
  expect(JSON.parse(fs.readFileSync('public/assets/catalog-native/roster.json', 'utf8'))).toEqual(
    roster,
  );
});
