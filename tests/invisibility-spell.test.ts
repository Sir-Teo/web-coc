import { ReleasedGameModel as GameModel, useReleasedCombat } from './fixtures/released-combat';
import { describe, expect, it } from 'vitest';
import { makeBuilding, type SpellBook, type Unit } from '../src/game/model';
import { SPELLS, SPELL_KEYS, spellStatsAt } from '../src/game/data';
import { SPELL_UNLOCK } from '../src/game/army-unlocks';
import {
  INVISIBILITY_LINGER,
  INVISIBILITY_RADIUS,
  invisibilitySeconds,
  maxSpellLevelFor,
} from '../src/game/spell-progression';
import { untargetable } from '../src/game/spell-effects';
import { SPELL_ROSTER } from '../src/game/troop-progression';
import { REPLAY_VERSION, spellKeysAt, validateReplay } from '../src/game/replay';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { fundedVillage } from './fixtures/funded-village';

const attacker = (id: number, x: number, y: number): Unit => ({
  id,
  kind: 'giant',
  x,
  y,
  hp: 1000,
  maxHp: 1000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  spawnedAt: 0,
});

/** A practice battle with one Cannon and a Giant standing inside its range. */
function arena(level = 1) {
  const m = fundedVillage();
  m.state.obstacles = [];
  m.state.spellLevels = defaultSpellLevels();
  m.state.spellLevels.invisibility = level;
  m.state.spells = { ...emptySpells(), invisibility: 2 };
  m.startBattle(0, true);
  useReleasedCombat(m);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9001, 'cannon', 10, 10)];
  b.remaining = emptyArmy();
  b.units = [attacker(9500, 12, 11)];
  return { m, b, cannon: b.buildings[0], giant: b.units[0] };
}

describe('the Invisibility Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Invisibility;
    expect(source.building).toBe('Spell Factory');
    expect(SPELL_UNLOCK.invisibility).toBe(source.forge);
    expect(SPELL_UNLOCK.invisibility).toBe(6);
    expect(maxSpellLevelFor('invisibility')).toBe(source.levels.length);
    expect(maxSpellLevelFor('invisibility')).toBe(4);
    expect(SPELLS.invisibility.space).toBe(source.levels[0].housing);
    expect(INVISIBILITY_RADIUS).toBe(source.levels[0].mechanics!.radius);
    // The source states a pulse count and an interval, never a duration.
    const { pulses, interval } = source.levels[0].mechanics!;
    expect(invisibilitySeconds(1)).toBeCloseTo(pulses! * interval!);
    expect(invisibilitySeconds(4)).toBeGreaterThan(invisibilitySeconds(1));
    for (const row of source.levels) expect(row.damage).toBe(0);
    expect(spellStatsAt('invisibility', 4).effect).toBe(`${invisibilitySeconds(4)}s hidden`);
    // The source says what it does not cover; walls and siege machines stay visible.
    expect(source.immune).toEqual(['walls', 'siegeMachines']);
  });

  it('hides the troops under it for as long as the ring pulses, then lets go', () => {
    const { m, b, cannon, giant } = arena();
    expect(untargetable(b, giant)).toBe(false);
    m.activeSpell = 'invisibility';
    expect(m.castSpell(giant.x, giant.y)).toBe(true);
    expect(untargetable(b, giant)).toBe(true);
    // It deals no damage of its own.
    expect(cannon.hp).toBe(cannon.maxHp);
    // The ring keeps pulsing as the battle runs, so cover holds while it is alive.
    const ring = invisibilitySeconds(1);
    while (b.elapsed < ring - 0.1) {
      m.step(0.05);
      expect(`${b.elapsed.toFixed(2)} ${untargetable(b, giant)}`).toBe(
        `${b.elapsed.toFixed(2)} true`,
      );
    }
    // Cover outlasts the last pulse by its own linger and no longer.
    while (b.elapsed < ring + INVISIBILITY_LINGER + 0.2) m.step(0.05);
    expect(untargetable(b, giant)).toBe(false);
  });

  it('leaves a troop outside the veil in plain sight', () => {
    const { m, b, giant } = arena();
    const far = attacker(9501, giant.x + INVISIBILITY_RADIUS + 2, giant.y);
    b.units.push(far);
    m.activeSpell = 'invisibility';
    m.castSpell(giant.x, giant.y);
    expect(untargetable(b, giant)).toBe(true);
    expect(untargetable(b, far)).toBe(false);
  });

  it('stops a defence firing at what it cannot see', () => {
    // Without the veil the Cannon locks on and starts hurting the Giant.
    const plain = arena();
    for (let i = 0; i < 80 && plain.giant.hp === plain.giant.maxHp; i++) plain.m.step(0.05);
    expect(plain.b.defenseTargets[plain.cannon.id]).toBe(plain.giant.id);
    expect(plain.giant.hp).toBeLessThan(plain.giant.maxHp);

    // Under it the same Cannon never finds a target for as long as the veil holds, and the
    // Giant is never touched. The loop stops inside the ring, not past it.
    const veiled = arena();
    veiled.m.activeSpell = 'invisibility';
    veiled.m.castSpell(veiled.giant.x, veiled.giant.y);
    while (veiled.b.elapsed < invisibilitySeconds(1) - 0.2) {
      veiled.m.step(0.05);
      expect(veiled.b.defenseTargets[veiled.cannon.id]).toBeUndefined();
    }
    expect(veiled.giant.hp).toBe(veiled.giant.maxHp);
  });

  it('is version 49 content that no earlier recording may carry or cast', () => {
    expect(spellKeysAt(48)).not.toContain('invisibility');
    expect(spellKeysAt(49)).toContain('invisibility');
    expect(REPLAY_VERSION).toBeGreaterThanOrEqual(49);
    const { m, giant } = arena();
    m.activeSpell = 'invisibility';
    m.castSpell(giant.x, giant.y);
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    for (const version of [47, 48])
      expect(validateReplay({ ...replay, version }), `version ${version}`).toBe(false);
  });

  it('takes its own place in the book after the spells that predate it', () => {
    // It was appended, so it sits after the four that came before and before any that
    // came after; its index never moves.
    expect(SPELL_KEYS.indexOf('invisibility')).toBe(4);
    expect(Object.keys(emptySpells() as SpellBook)).toEqual([...SPELL_KEYS]);
  });
});
