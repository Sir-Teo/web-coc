import { expect, it } from 'vitest';
import source from '../reference/full-client/combat.json' with { type: 'json' };
import { nativeLevels, nativeRow, type NativeTable } from '../src/game/native-data';

const tables: NativeTable[] = [
  'characters',
  'heroes',
  'pets',
  'items',
  'spells',
  'abilities',
  'buildings',
  'traps',
  'weapons',
  'projectiles',
  'guardians',
  'upgrades',
];

it('preserves every pinned inherited row, frozen identity and level clamp across table caches', () => {
  let records = 0;
  for (const table of tables) {
    const entries = source[table] as Record<string, Record<string, string>[]>;
    for (const [name, declared] of Object.entries(entries)) {
      let inherited: Record<string, string> = {};
      const expected = declared.map((row) => (inherited = { ...inherited, ...row }));
      const actual = nativeLevels(table, name);
      expect(actual, `${table}/${name}`).toEqual(expected);
      expect(Object.isFrozen(actual)).toBe(true);
      expect(actual.every(Object.isFrozen)).toBe(true);
      expect(nativeLevels(table, name)).toBe(actual);
      for (const [index, row] of actual.entries()) {
        expect(nativeRow(table, name, index + 1)).toBe(row);
      }
      expect(nativeRow(table, name, 0)).toBe(actual[0]);
      expect(nativeRow(table, name, Number.NaN)).toBe(actual[0]);
      expect(nativeRow(table, name, Number.POSITIVE_INFINITY)).toBe(actual.at(-1));
      records++;
    }
  }
  expect(records).toBeGreaterThan(100);
});

it('does not alias records with the same name in different source tables', () => {
  const seen = new Map<string, NativeTable>();
  let sharedNames = 0;
  for (const table of tables) {
    for (const name of Object.keys(source[table])) {
      const prior = seen.get(name);
      if (prior) {
        expect(nativeLevels(table, name)).not.toBe(nativeLevels(prior, name));
        sharedNames++;
      } else seen.set(name, table);
    }
  }
  expect(sharedNames).toBeGreaterThan(0);
});

it('retains the missing-record error without caching a false result', () => {
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => nativeLevels('characters', '__recovery_missing_record__')).toThrow(
      'Missing native characters record: __recovery_missing_record__',
    );
  }
});
