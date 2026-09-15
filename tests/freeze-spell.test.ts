import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { SPELLS, SPELL_KEYS, SPELL_HOTKEYS, TROOP_HOTKEYS, spellStatsAt } from '../src/game/data';
import { SPELL_UNLOCK } from '../src/game/army-unlocks';
import { freezeSeconds, FREEZE_RADIUS, maxSpellLevelFor } from '../src/game/spell-progression';
import { SPELL_ROSTER } from '../src/game/troop-progression';
import { REPLAY_VERSION, spellKeysAt, validateReplay } from '../src/game/replay';
import { defaultSpellLevels, emptySpells } from '../src/game/army';
import { fundedVillage } from './fixtures/funded-village';
import { developedSave } from './fixtures/developed-village';

/** A practice battle with one Cannon, one Archer Tower and a full book of spells. */
function arena(level = 1) {
  const m = fundedVillage();
  m.state.obstacles = [];
  m.state.spellLevels = defaultSpellLevels();
  m.state.spellLevels.freeze = level;
  m.state.spells = { ...emptySpells(), freeze: 2 };
  m.startBattle(0, true);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9001, 'cannon', 10, 10), makeBuilding(9002, 'archertower', 20, 20)];
  return { m, b };
}

describe('the Freeze Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Freeze;
    expect(source.building).toBe('Spell Factory');
    expect(SPELL_UNLOCK.freeze).toBe(source.forge);
    expect(SPELL_UNLOCK.freeze).toBe(4);
    expect(maxSpellLevelFor('freeze')).toBe(source.levels.length);
    expect(maxSpellLevelFor('freeze')).toBe(8);
    expect(SPELLS.freeze.space).toBe(source.levels[0].housing);
    expect(FREEZE_RADIUS).toBe(source.levels[0].mechanics!.radius);
    expect(freezeSeconds(1)).toBe(2.5);
    // It only ever gets colder, and it never deals damage.
    for (const [index, row] of source.levels.slice(1).entries())
      expect(row.mechanics!.freeze!).toBeGreaterThanOrEqual(
        source.levels[index].mechanics!.freeze!,
      );
    for (const row of source.levels) expect(row.damage).toBe(0);
    expect(spellStatsAt('freeze', 8).effect).toBe(`${freezeSeconds(8)}s freeze`);
  });

  it('holds defences and defenders without dealing damage', () => {
    const { m, b } = arena();
    const cannon = b.buildings[0];
    const before = cannon.hp;
    m.activeSpell = 'freeze';
    expect(m.castSpell(cannon.x + 1, cannon.y + 1)).toBe(true);
    expect(cannon.hp).toBe(before);
    expect(b.defenseStuns[cannon.id]).toBeCloseTo(b.elapsed + freezeSeconds(1));
    // The Archer Tower is well outside the radius and keeps firing.
    expect(b.defenseStuns[b.buildings[1].id]).toBeUndefined();
  });

  it('gets longer with research and never shortens an existing freeze', () => {
    const { m, b } = arena(8);
    const cannon = b.buildings[0];
    m.activeSpell = 'freeze';
    m.castSpell(cannon.x + 1, cannon.y + 1);
    const long = b.defenseStuns[cannon.id];
    expect(long).toBeCloseTo(b.elapsed + freezeSeconds(8));
    expect(freezeSeconds(8)).toBeGreaterThan(freezeSeconds(1));
    // A second cast while the first still holds may only extend it.
    m.castSpell(cannon.x + 1, cannon.y + 1);
    expect(b.defenseStuns[cannon.id]).toBeGreaterThanOrEqual(long);
  });

  it('needs a Spell Factory 4 before the Laboratory will research it', () => {
    const m = new GameModel(developedSave());
    m.townhall!.level = 8;
    m.laboratory!.level = 8;
    m.state.elixir = 10_000_000;
    m.state.spellLevels = defaultSpellLevels();
    for (const b of m.state.buildings) if (b.kind === 'spellfactory') b.level = 3;
    m.research('freeze');
    expect(m.state.research).toBeUndefined();
    for (const b of m.state.buildings) if (b.kind === 'spellfactory') b.level = 4;
    m.research('freeze');
    expect(m.state.research?.kind).toBe('freeze');
  });

  it('is version 48 content that no earlier recording may carry or cast', () => {
    // The spell arrived at version 48 and every later recording still carries it.
    expect(spellKeysAt(47)).not.toContain('freeze');
    expect(spellKeysAt(48)).toContain('freeze');
    expect(spellKeysAt(REPLAY_VERSION)).toContain('freeze');
    const { m } = arena();
    m.activeSpell = 'freeze';
    m.castSpell(10, 10);
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(replay.version).toBe(REPLAY_VERSION);
    expect(validateReplay(replay)).toBe(true);
    // The same recording relabelled as version 47 carries a spell that version never had.
    expect(validateReplay({ ...replay, version: 47 })).toBe(false);
  });

  it('takes a keyboard shortcut no troop already answers to', () => {
    // Both lists are matched against the same lowercased key, so a shared entry would fire
    // two actions from one press.
    const shared = SPELL_HOTKEYS.filter((k) => TROOP_HOTKEYS.includes(k.toLowerCase()));
    expect(shared).toEqual([]);
    expect(SPELL_HOTKEYS).toHaveLength(SPELL_KEYS.length);
    expect(new Set(SPELL_HOTKEYS).size).toBe(SPELL_HOTKEYS.length);
  });

  it('keeps the spell book key order, which archived battles are hashed by', () => {
    // Appending rather than inserting is what keeps every older battle state byte-identical:
    // the original three keep their places and each new spell goes on the end.
    expect(SPELL_KEYS.slice(0, 4)).toEqual(['rage', 'heal', 'lightning', 'freeze']);
    expect(Object.keys(emptySpells())).toEqual([...SPELL_KEYS]);
    // Every recording's own book is a prefix-stable subset of today's, in the same order.
    for (const version of [47, 48, REPLAY_VERSION]) {
      const book = spellKeysAt(version);
      expect(book).toEqual(SPELL_KEYS.filter((k) => book.includes(k)));
    }
  });
});
