import { ReleasedGameModel as GameModel, useReleasedCombat } from './fixtures/released-combat';
import { describe, expect, it } from 'vitest';
import { findPath, makeBuilding, type SpellBook, type Unit } from '../src/game/model';
import { SPELLS, SPELL_KEYS, TROOPS, spellStatsAt } from '../src/game/data';
import { SPELL_UNLOCK } from '../src/game/army-unlocks';
import {
  CLONE_LIFETIME,
  JUMP_RADIUS,
  cloneHousing,
  jumpSeconds,
  maxSpellLevelFor,
  recallHousing,
  reviveFraction,
} from '../src/game/spell-progression';
import { openBreaches } from '../src/game/spell-effects';
import { SPELL_ROSTER } from '../src/game/troop-progression';
import { REPLAY_VERSION, spellKeysAt, validateReplay } from '../src/game/replay';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../src/game/army';
import { fundedVillage } from './fixtures/funded-village';

const attacker = (id: number, kind: Unit['kind'], x: number, y: number, hp = 1000): Unit => ({
  id,
  kind,
  x,
  y,
  hp,
  maxHp: 1000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  spawnedAt: 0,
});

/** A practice battle holding two of every spell, with an empty board to place things on. */
function arena(levels: Partial<SpellBook> = {}) {
  const m = fundedVillage();
  m.state.obstacles = [];
  m.state.spellLevels = { ...defaultSpellLevels(), ...levels };
  m.state.spells = Object.fromEntries(SPELL_KEYS.map((k) => [k, 2])) as SpellBook;
  m.startBattle(0, true);
  useReleasedCombat(m);
  const b = m.battle!;
  b.started = true;
  b.buildings = [makeBuilding(9001, 'townhall', 20, 20)];
  b.remaining = emptyArmy();
  b.units = [];
  return { m, b };
}

describe('the Jump Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Jump;
    expect(source.building).toBe('Spell Factory');
    expect(SPELL_UNLOCK.jump).toBe(source.forge);
    expect(SPELL_UNLOCK.jump).toBe(4);
    expect(maxSpellLevelFor('jump')).toBe(5);
    expect(SPELLS.jump.space).toBe(source.levels[0].housing);
    expect(JUMP_RADIUS).toBe(source.levels[0].mechanics!.radius);
    const { pulses, interval } = source.levels[0].mechanics!;
    expect(jumpSeconds(1)).toBeCloseTo(pulses! * interval!);
    // A higher level holds the breach open longer and nothing else.
    expect(jumpSeconds(5)).toBeGreaterThan(jumpSeconds(1));
    for (const row of source.levels) expect(row.damage).toBe(0);
  });

  it('opens a breach for as long as the ring holds, then closes it', () => {
    const { m, b } = arena();
    expect(openBreaches(b)).toHaveLength(0);
    m.activeSpell = 'jump';
    expect(m.castSpell(12, 12)).toBe(true);
    expect(openBreaches(b)).toHaveLength(1);
    expect(openBreaches(b)[0]).toMatchObject({ x: 12, y: 12 });
    b.elapsed = jumpSeconds(1) + 1;
    expect(openBreaches(b)).toHaveLength(0);
  });

  it('routes a ground troop through a wall it would otherwise walk around', () => {
    // A wall four deep and seventeen tall, with the target squarely behind it. Crossing four
    // walls costs more than walking round the top, so the unbreached route goes round.
    const hall = makeBuilding(9001, 'townhall', 26, 19);
    const buildings = [hall];
    let id = 9100;
    for (let x = 20; x < 24; x++)
      for (let y = 12; y < 29; y++) buildings.push(makeBuilding(id++, 'wall', x, y));
    const start = { x: 12, y: 20 };

    const around = findPath(start, hall, buildings, 1);
    const through = findPath(start, hall, buildings, 1, false, [{ x: 21.5, y: 20.5 }]);
    expect(around.length).toBeGreaterThan(0);
    // The breached route is the straight line; the detour is much longer.
    expect(through.length).toBeLessThan(around.length);
    expect(around.length - through.length).toBeGreaterThan(8);
    // The breach is a hole, not a demolition: every wall is still standing.
    expect(buildings.filter((v) => v.kind === 'wall' && v.hp > 0)).toHaveLength(68);
  });
});

describe('the Clone Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Clone;
    expect(SPELL_UNLOCK.clone).toBe(source.forge);
    expect(SPELL_UNLOCK.clone).toBe(5);
    expect(maxSpellLevelFor('clone')).toBe(9);
    expect(cloneHousing(1)).toBe(source.levels[0].mechanics!.duplicateHousing);
    expect(cloneHousing(9)).toBeGreaterThan(cloneHousing(1));
    expect(CLONE_LIFETIME).toBe(source.levels[0].mechanics!.duplicateLifetime);
    expect(spellStatsAt('clone', 9).effect).toBe(`${cloneHousing(9)} housing copied`);
  });

  it('copies what stands in the ring, up to the housing it can carry', () => {
    const { m, b } = arena();
    // Six Giants at five housing each is thirty; level one carries twenty-two, so four fit.
    for (let i = 0; i < 6; i++) b.units.push(attacker(9500 + i, 'giant', 12 + i * 0.2, 12));
    m.activeSpell = 'clone';
    expect(m.castSpell(12, 12)).toBe(true);
    const copies = b.units.filter((u) => u.summoned);
    expect(copies.length).toBe(Math.floor(cloneHousing(1) / TROOPS.giant.space));
    for (const copy of copies) {
      expect(copy.kind).toBe('giant');
      expect(copy.hp).toBe(copy.maxHp);
      expect(copy.fadesAt).toBeCloseTo(b.elapsed + CLONE_LIFETIME);
    }
  });

  it('lets each copy fade when its life runs out', () => {
    const { m, b } = arena();
    b.units.push(attacker(9500, 'giant', 12, 12));
    m.activeSpell = 'clone';
    m.castSpell(12, 12);
    const copy = b.units.find((u) => u.summoned)!;
    b.elapsed = CLONE_LIFETIME + 1;
    m.step(0.05);
    expect(copy.hp).toBe(0);
    // The original is untouched.
    expect(b.units[0].hp).toBe(1000);
  });
});

describe('the Recall Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Recall;
    expect(SPELL_UNLOCK.recall).toBe(source.forge);
    expect(SPELL_UNLOCK.recall).toBe(7);
    expect(maxSpellLevelFor('recall')).toBe(7);
    expect(recallHousing(1)).toBe(source.levels[0].mechanics!.recallHousing);
    expect(recallHousing(7)).toBeGreaterThan(recallHousing(1));
  });

  it('takes troops back into the hand and leaves copies behind', () => {
    const { m, b } = arena();
    b.units.push(attacker(9500, 'giant', 12, 12), attacker(9501, 'archer', 12.5, 12));
    b.units.push({ ...attacker(9502, 'giant', 12, 12.5), summoned: true });
    const before = { ...b.remaining };
    m.activeSpell = 'recall';
    expect(m.castSpell(12, 12)).toBe(true);
    expect(b.units).toHaveLength(0);
    // The two real troops return to the hand; the copy simply goes.
    expect(b.remaining.giant).toBe(before.giant + 1);
    expect(b.remaining.archer).toBe(before.archer + 1);
  });

  it('leaves troops outside its reach where they stand', () => {
    const { m, b } = arena();
    b.units.push(attacker(9500, 'giant', 12, 12), attacker(9501, 'giant', 40, 40));
    m.activeSpell = 'recall';
    m.castSpell(12, 12);
    expect(b.units.map((u) => u.id)).toEqual([9501]);
  });
});

describe('the Revive Spell', () => {
  it('reads its whole definition from the pinned source', () => {
    const source = SPELL_ROSTER.Revive;
    expect(SPELL_UNLOCK.revive).toBe(source.forge);
    expect(SPELL_UNLOCK.revive).toBe(8);
    expect(maxSpellLevelFor('revive')).toBe(5);
    expect(reviveFraction(1)).toBe(source.levels[0].mechanics!.resurrect);
    expect(reviveFraction(1)).toBe(0.6);
    expect(reviveFraction(5)).toBeGreaterThan(reviveFraction(1));
  });

  it('stands a fallen hero back up part way healed', () => {
    const { m, b } = arena();
    const king: Unit = { ...attacker(9500, 'swordsman', 12, 12, 0), hero: 'king', maxHp: 2000 };
    king.defeatedAt = b.elapsed;
    b.units.push(king);
    m.activeSpell = 'revive';
    expect(m.castSpell(12, 12)).toBe(true);
    expect(king.hp).toBe(Math.round(2000 * reviveFraction(1)));
    expect(king.defeatedAt).toBeUndefined();
  });

  it('is not spent when there is no fallen hero to reach', () => {
    const { m, b } = arena();
    const held = b.spells.revive;
    m.activeSpell = 'revive';
    expect(m.castSpell(12, 12)).toBe(false);
    expect(b.spells.revive).toBe(held);
  });
});

describe('all four together', () => {
  it('are version 50 content that no earlier recording may carry or cast', () => {
    for (const kind of ['jump', 'clone', 'recall', 'revive'] as const) {
      expect(spellKeysAt(49), kind).not.toContain(kind);
      expect(spellKeysAt(50), kind).toContain(kind);
    }
    expect(REPLAY_VERSION).toBeGreaterThanOrEqual(50);
    const { m } = arena();
    m.activeSpell = 'jump';
    m.castSpell(12, 12);
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    for (const version of [47, 48, 49])
      expect(validateReplay({ ...replay, version }), `version ${version}`).toBe(false);
  });

  it('keep the book prefix-stable and take hotkeys no troop answers to', () => {
    expect(SPELL_KEYS.slice(0, 5)).toEqual(['rage', 'heal', 'lightning', 'freeze', 'invisibility']);
    expect(Object.keys(emptySpells())).toEqual([...SPELL_KEYS]);
    for (const version of [47, 48, 49, REPLAY_VERSION]) {
      const book = spellKeysAt(version);
      expect(book).toEqual(SPELL_KEYS.filter((k) => book.includes(k)));
    }
  });
});
