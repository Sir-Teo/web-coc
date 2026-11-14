import { describe, expect, it } from 'vitest';
import oracle from '../reference/native-spring-ejection-18.400.22.json' with { type: 'json' };
import reduction from '../reference/native-trap-reduction-18.400.22.json' with { type: 'json' };
import combat from '../reference/full-client/combat.json' with { type: 'json' };
import { nativeRow, text } from '../src/game/native-data';
import { nativeSpringTrapOutcome } from '../src/game/native-spring-trap';
import type { UnitKind } from '../src/game/data';
import type { Unit } from '../src/game/model';

// These are web representatives of the recorded fixture categories, not original
// Android objects. Ejection and damage were isolated native calls in the oracle.
const projections = {
  ordinary_barracks_control: 'archer',
  ordinary_dark_barracks_control: 'valkyrie',
  source_protected_character: 'rootrider',
  source_protected_pet: 'lassi',
  siege_forced_protection: 'wallwrecker',
  hero_category_guard: 'barbarianking',
} satisfies Record<string, UnitKind>;
const exclusions = {
  siege_category_additional_guard:
    'Synthetic post-initialization flag override has no corresponding public port state.',
  air_state_guard:
    'This helper assumes an eligible target; air filtering is tested through stepTraps elsewhere.',
};
function unit(kind: UnitKind): Unit {
  return { id: 1, kind, level: 1, x: 10, y: 10, hp: 10000, maxHp: 10000,
    cooldown: 0, target: null, path: [], pathAt: 0, attacking: false };
}

describe('retained Spring Trap oracle links (not a native rerun)', () => {
  it('accounts explicitly for every retained fixture without silently increasing coverage', () => {
    expect(Object.keys(projections).length).toBe(6);
    expect(Object.keys(exclusions).length).toBe(2);
    expect([...Object.keys(projections), ...Object.keys(exclusions)].sort())
      .toEqual(oracle.cases.map(c => c.name).sort());
  });

  for (const [name, kind] of Object.entries(projections)) {
    const recorded = oracle.cases.find(c => c.name === name)!;
    it(`projects the recorded ${name} ejection outcome onto ${kind}`, () => {
      expect(recorded).toBeDefined();
      const result = nativeSpringTrapOutcome(unit(kind), 13, recorded.synthetic_hitpoint_damage_input);
      expect(result.ejected).toBe(recorded.ejected);
      // Successful pre-damage ejection bypasses damage in the web orchestration;
      // do not equate that final HP with the separately measured native damage helper.
      if (!recorded.ejected) {
        expect(result.hp).toBe(10000 - recorded.hitpoint_damage);
        expect(result.hp).toBe(10000 - recorded.native_damage_result_hundredths / 100);
      }
    });
    if (!recorded.ejected) {
      it(`keeps raw-native units distinct from HP input for ${name}`, () => {
        const result = nativeSpringTrapOutcome(unit(kind), 13, recorded.raw_native_damage_input / 100);
        expect(result.hp).toBe(10000 - recorded.raw_native_damage_result / 100);
      });
    }
  }

  it('links recorded table digests without mistaking matching metadata for a fresh file hash', () => {
    expect(Object.keys(oracle.source_records)).toHaveLength(11);
    expect(Object.keys(oracle.source_tables).sort()).toEqual(['buildings', 'characters', 'pets', 'traps']);
    for (const source of Object.values(oracle.source_tables))
      expect(combat.sources[source.path as keyof typeof combat.sources]).toBe(source.sha256);
    expect(oracle.source_tables.traps.sha256).toBe(reduction.source_table.sha256);
    expect(oracle.source_sha256).toBe(reduction.recovered_rx_sha256);
    expect(oracle.original_apk_sha256).toBe(reduction.original_apk_sha256);
    expect(oracle.image_writes).toEqual([]);
    expect(oracle.limitations).not.toHaveLength(0);
    // Export label and executable version differ; matching four recorded table
    // digests is scoped evidence, not a claim that the complete clients match.
    expect(combat.clientVersion).toBe('18.400.21');
    expect(oracle.version).toBe('18.400.22');
  });

  for (const [name, fields] of Object.entries(oracle.source_records)) {
    it(`keeps exported source fields linked to the retained ${name} record`, () => {
      const tables = (['characters', 'pets', 'buildings', 'traps'] as const)
        .filter(table => Object.hasOwn(combat[table], name));
      expect(tables).toHaveLength(1);
      const row = nativeRow(tables[0], name);
      for (const [field, expected] of Object.entries(fields))
        expect(text(row, field), `${name}.${field}`).toBe(expected);
    });
  }
});
