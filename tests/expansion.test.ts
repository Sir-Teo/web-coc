import { emptySpells } from '../src/game/army';
import { maxTroopLevel } from '../src/game/data';
import { developedSave } from './fixtures/developed-village';
import { describe, it, expect } from 'vitest';
import { fundedVillage } from './fixtures/funded-village';
import { GameModel, initialSave, makeBuilding, PREP_SECONDS, type Save } from '../src/game/model';
import {
  BUILDINGS,
  MAX_TROOP_LEVEL,
  TROOP_KEYS,
  maxTroopLevel,
  researchLaboratory,
  SPELLS,
  TROOPS,
  upgradeSeconds,
  gemCost,
} from '../src/game/data';
import { migrateSave, validateSave } from '../src/game/save';
import { emptySpells } from '../src/game/army';

/** A battle with a hand-built enemy base, so a single interaction can be isolated. */
function arena(
  m: GameModel,
  buildings: [Parameters<typeof makeBuilding>[1], number, number, number][],
) {
  m.startBattle(0);
  m.battle!.buildings = buildings.map(([kind, x, y, level], i) =>
    makeBuilding(2000 + i, kind, x, y, level),
  );
  m.battle!.auras = [];
  return m.battle!;
}

function overlapping(model: GameModel) {
  const all = model.state.buildings;
  return all.some((a) =>
    all.some(
      (b) =>
        a.id !== b.id &&
        a.x < b.x + BUILDINGS[b.kind].size &&
        a.x + BUILDINGS[a.kind].size > b.x &&
        a.y < b.y + BUILDINGS[b.kind].size &&
        a.y + BUILDINGS[a.kind].size > b.y,
    ),
  );
}

describe('scouting phase (practice countdown, shared deployment boundary)', () => {
  it('holds the battle clock for thirty seconds and starts early on the first deploy', () => {
    const m = new GameModel();
    m.startBattle(0, true);
    expect(m.battle!.prep).toBe(PREP_SECONDS);
    expect(m.battle!.started).toBe(false);
    m.step(1);
    expect(m.battle!.prep).toBeCloseTo(PREP_SECONDS - 1);
    expect(m.battle!.elapsed).toBe(0);
    m.deploy(1, 13);
    expect(m.battle!.started).toBe(true);
    expect(m.battle!.prep).toBe(0);
  });
  it('starts on its own when the scouting time runs out', () => {
    const m = new GameModel();
    m.startBattle(0, true);
    for (let i = 0; i < PREP_SECONDS * 2; i++) m.step(1);
    expect(m.battle!.started).toBe(true);
    expect(m.battle!.elapsed).toBeGreaterThan(0);
  });
  it('reports the same blocked tiles the red boundary is drawn from', () => {
    const m = new GameModel();
    m.startBattle(0);
    const townhall = m.battle!.buildings.find((b) => b.kind === 'townhall')!;
    expect(m.deployBlocked(townhall.x + 1, townhall.y + 1)).toBe(true);
    expect(m.deployBlocked(townhall.x - 1, townhall.y)).toBe(true);
    expect(m.deployBlocked(1, 13)).toBe(false);
    expect(m.deployBlocked(0.5, 13)).toBe(true);
  });
});

/** Deploys on clear ground, then places the unit exactly where the test needs it. */
function spawn(m: GameModel, kind: Parameters<GameModel['train']>[0], x: number, y: number) {
  m.activeTroop = kind;
  expect(m.deploy(1, 1)).toBe(true);
  const unit = m.battle!.units.at(-1)!;
  unit.x = x;
  unit.y = y;
  return unit;
}

describe('the air layer', () => {
  it('a ground-only cannon never touches a balloon', () => {
    const m = new GameModel(developedSave());
    arena(m, [
      ['cannon', 10, 10, 1],
      ['townhall', 20, 20, 1],
    ]);
    const balloon = spawn(m, 'balloon', 12, 12);
    for (let i = 0; i < 120; i++) m.step(0.05);
    expect(balloon.hp).toBe(balloon.maxHp);
  });
  it('an air defense never touches a ground troop', () => {
    const m = new GameModel();
    arena(m, [
      ['airdefense', 10, 10, 1],
      ['townhall', 20, 20, 1],
    ]);
    const swordsman = spawn(m, 'swordsman', 12, 12);
    for (let i = 0; i < 120; i++) m.step(0.05);
    expect(swordsman.hp).toBe(swordsman.maxHp);
  });
  it('an air defense tears into a balloon', () => {
    const m = new GameModel(developedSave());
    arena(m, [
      ['airdefense', 10, 10, 1],
      ['townhall', 20, 20, 1],
    ]);
    const balloon = spawn(m, 'balloon', 12, 12);
    for (let i = 0; i < 120; i++) m.step(0.05);
    expect(balloon.hp).toBeLessThan(balloon.maxHp);
  });
  it('a balloon crosses walls without breaking them', () => {
    const m = new GameModel(developedSave());
    const walls: [Parameters<typeof makeBuilding>[1], number, number, number][] = [];
    for (let y = 6; y <= 18; y++) walls.push(['wall', 12, y, 1]);
    const battle = arena(m, [['townhall', 16, 11, 1], ...walls]);
    m.activeTroop = 'balloon';
    m.deploy(6, 12);
    for (let i = 0; i < 400; i++) m.step(0.05);
    const balloon = battle.units[0];
    expect(balloon.x).toBeGreaterThan(12);
    expect(battle.buildings.filter((b) => b.kind === 'wall').every((b) => b.hp === b.maxHp)).toBe(
      true,
    );
  });
  it('a ground troop stops at an intact wall and proceeds only after breaking it', () => {
    const m = new GameModel();
    const walls: [Parameters<typeof makeBuilding>[1], number, number, number][] = [];
    for (let y = 6; y <= 18; y++) walls.push(['wall', 12, y, 1]);
    const battle = arena(m, [['townhall', 16, 11, 1], ...walls]);
    m.activeTroop = 'swordsman';
    m.deploy(6, 12);
    let attackedIntactWall = false;
    for (let i = 0; i < 400; i++) {
      m.step(0.05);
      if (battle.buildings.some((b) => b.kind === 'wall' && b.hp > 0 && b.hp < b.maxHp)) {
        attackedIntactWall = true;
        expect(battle.units[0].x).toBeLessThan(12);
      }
      if (battle.units[0].x >= 12)
        expect(battle.buildings.some((b) => b.kind === 'wall' && b.hp === 0)).toBe(true);
    }
    expect(attackedIntactWall).toBe(true);
    expect(battle.units[0].x).toBeGreaterThan(12);
  });
});

describe('spells', () => {
  it('brews within the spell factory capacity and refuses beyond it', () => {
    const m = new GameModel(developedSave());
    m.state.spells = {
      rage: 0,
      heal: 0,
      lightning: 0,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    expect(m.spellCapacity).toBe(6);
    const elixir = m.state.elixir;
    m.brew('rage', 2);
    m.brew('lightning');
    expect(m.spellHousing).toBe(5);
    expect(m.state.spellQueue).toHaveLength(0);
    expect(m.state.elixir).toBe(elixir);
    m.brew('heal');
    expect(m.spellHousing).toBe(5);
    expect(m.state.spellQueue).toHaveLength(0);
    expect(m.state.elixir).toBe(elixir);
    m.tick(m.clock + (SPELLS.rage.time + SPELLS.lightning.time) * 1000 + 1000);
    expect(m.state.spells.rage).toBe(2);
    expect(m.state.spells.lightning).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });
  it('lightning damages every building inside its radius, once', () => {
    const m = new GameModel();
    m.state.spells = {
      rage: 0,
      heal: 0,
      lightning: 1,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    const battle = arena(m, [
      ['cannon', 10, 10, 4],
      ['cannon', 11, 12, 4],
      ['cannon', 22, 22, 1],
    ]);
    battle.spells = {
      rage: 0,
      heal: 0,
      lightning: 1,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    m.activeSpell = 'lightning';
    expect(m.castSpell(11.5, 11.5)).toBe(true);
    const [near, alsoNear, far] = battle.buildings;
    expect(near.maxHp - near.hp).toBeCloseTo(150, 3);
    expect(alsoNear.maxHp - alsoNear.hp).toBeCloseTo(150, 3);
    expect(far.hp).toBe(far.maxHp);
    expect(battle.spells.lightning).toBe(0);
    expect(m.state.spells.lightning).toBe(0);
    expect(m.castSpell(11.5, 11.5)).toBe(false);
  });
  it('rage makes troops hit measurably harder', () => {
    const damageOver = (raged: boolean) => {
      const m = new GameModel();
      m.state.spells = {
        rage: 1,
        heal: 0,
        lightning: 0,
        freeze: 0,
        invisibility: 0,
        jump: 0,
        clone: 0,
        recall: 0,
        revive: 0,
      };
      const battle = arena(m, [['townhall', 12, 12, 1]]);
      battle.spells = {
        rage: 1,
        heal: 0,
        lightning: 0,
        freeze: 0,
        invisibility: 0,
        jump: 0,
        clone: 0,
        recall: 0,
        revive: 0,
      };
      m.activeTroop = 'swordsman';
      m.deploy(10, 13);
      if (raged) {
        m.activeSpell = 'rage';
        m.castSpell(10, 13);
      }
      for (let i = 0; i < 200; i++) m.step(0.05);
      return battle.buildings[0].maxHp - battle.buildings[0].hp;
    };
    const plain = damageOver(false);
    const enraged = damageOver(true);
    expect(plain).toBeGreaterThan(0);
    expect(enraged).toBeGreaterThan(plain);
  });
  it('healing restores wounded troops standing inside it', () => {
    const m = new GameModel();
    m.state.spells = {
      rage: 0,
      heal: 1,
      lightning: 0,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    const battle = arena(m, [['townhall', 20, 20, 1]]);
    battle.spells = {
      rage: 0,
      heal: 1,
      lightning: 0,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    m.activeTroop = 'swordsman';
    m.deploy(4, 4);
    const unit = battle.units[0];
    unit.hp = 40;
    m.activeSpell = 'heal';
    expect(m.castSpell(unit.x, unit.y)).toBe(true);
    for (let i = 0; i < 20; i++) m.step(0.05);
    expect(unit.hp).toBeGreaterThan(40);
    expect(unit.hp).toBeLessThanOrEqual(unit.maxHp);
  });
  it('auras expire and stop applying', () => {
    const m = new GameModel();
    m.state.spells = {
      rage: 1,
      heal: 0,
      lightning: 0,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    const battle = arena(m, [['townhall', 20, 20, 1]]);
    battle.spells = {
      rage: 1,
      heal: 0,
      lightning: 0,
      freeze: 0,
      invisibility: 0,
      jump: 0,
      clone: 0,
      recall: 0,
      revive: 0,
    };
    m.activeTroop = 'swordsman';
    m.deploy(4, 4);
    m.activeSpell = 'rage';
    m.castSpell(4, 4);
    expect(battle.auras).toHaveLength(1);
    for (let i = 0; i < SPELLS.rage.duration * 20 + 20; i++) m.step(0.05);
    expect(battle.auras).toHaveLength(0);
  });
});

describe('town hall gating and stretched timers', () => {
  it('uses building-specific Town Hall level caps', () => {
    const m = fundedVillage();
    expect(m.townhallLevel).toBe(2);
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon' && b.level === 2)!;
    expect(m.maxLevel('cannon')).toBe(3);
    m.upgrade(cannon.id);
    expect(cannon.upgradeEnd).toBeDefined();
    m.tick(cannon.upgradeEnd! + 1000);
    expect(cannon.level).toBe(3);
    m.upgrade(cannon.id);
    expect(cannon.upgradeEnd).toBeUndefined();
    const townhall = m.townhall!;
    townhall.level = 5;
    expect(m.maxLevel('cannon')).toBe(6);
  });
  it('unlocks more of each building as the town hall grows', () => {
    const m = new GameModel();
    expect(m.maxCount('mortar')).toBe(0);
    m.townhall!.level = 3;
    expect(m.maxCount('mortar')).toBe(1);
    m.townhall!.level = 6;
    expect(m.maxCount('mortar')).toBe(2);
    expect(m.maxCount('airdefense')).toBe(2);
  });
  it('scales upgrade timers and prices gems on the Clash curve', () => {
    expect(upgradeSeconds('cannon', 1)).toBe(30);
    expect(upgradeSeconds('cannon', 5)).toBeGreaterThan(upgradeSeconds('cannon', 4));
    expect(upgradeSeconds('townhall', 7)).toBeGreaterThan(3600);
    expect(gemCost(30)).toBe(1);
    expect(gemCost(3600)).toBe(20);
    expect(gemCost(86400)).toBe(260);
    expect(gemCost(7200)).toBeGreaterThan(gemCost(3600));
  });
});

describe('edit mode', () => {
  it('rejects invalid layout slots without allocating or altering saved layouts', () => {
    const m = new GameModel();
    const before = structuredClone(m.state);
    for (const slot of [-1, 3, 0.5, NaN, Infinity]) {
      m.saveLayout(slot);
      expect(m.state).toEqual(before);
    }
  });
  it('drags buildings, refuses occupied ground, and undoes and redoes', () => {
    const m = new GameModel(developedSave());
    m.beginEdit();
    expect(m.editing).toBe(true);
    const b = m.state.buildings.find((v) => v.kind === 'laboratory')!;
    const from = { x: b.x, y: b.y };
    expect(m.dragTo(b.id, 2, 2)).toBe(true);
    expect([b.x, b.y]).toEqual([2, 2]);
    const townhall = m.townhall!;
    expect(m.dragTo(b.id, townhall.x, townhall.y)).toBe(false);
    expect([b.x, b.y]).toEqual([2, 2]);
    m.undo();
    expect([b.x, b.y]).toEqual([from.x, from.y]);
    m.redo();
    expect([b.x, b.y]).toEqual([2, 2]);
    expect(validateSave(m.state)).toBe(true);
  });
  it('refuses to restore a layout that would stack buildings raised since it was saved', () => {
    const m = new GameModel();
    m.townhall!.level = 5; // The third Cannon unlocks at TH5.
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.state.gold = 9_000_000;
    m.state.elixir = 9_000_000;
    m.beginEdit();
    m.saveLayout(0);
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    const vacated = { x: mine.x, y: mine.y };
    expect(m.dragTo(mine.id, 23, 2)).toBe(true);
    m.endEdit();
    m.placement = 'cannon';
    expect(m.place(vacated.x, vacated.y)).toBe(true);
    const cannon = m.state.buildings.at(-1)!;
    const messages: string[] = [];
    m.onToast = (t) => messages.push(t);
    m.loadLayout(0);
    expect(messages.at(-1)).toMatch(/does not fit/i);
    expect([mine.x, mine.y]).toEqual([23, 2]);
    expect([cannon.x, cannon.y]).toEqual([vacated.x, vacated.y]);
    expect(overlapping(m)).toBe(false);
    expect(validateSave(m.state)).toBe(true);
  });
  it('refuses an undo that a newly placed building would collide with', () => {
    const m = new GameModel();
    m.townhall!.level = 5; // The third Cannon unlocks at TH5.
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.state.gold = 9_000_000;
    m.state.elixir = 9_000_000;
    m.beginEdit();
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    const vacated = { x: mine.x, y: mine.y };
    expect(m.dragTo(mine.id, 23, 2)).toBe(true);
    expect(m.canUndo).toBe(true);
    m.placement = 'cannon';
    expect(m.place(vacated.x, vacated.y)).toBe(true);
    m.undo();
    expect([mine.x, mine.y]).toEqual([23, 2]);
    expect(overlapping(m)).toBe(false);
    expect(m.canUndo).toBe(true);
  });
  it('stores and restores three layouts', () => {
    const m = new GameModel(developedSave());
    m.beginEdit();
    const b = m.state.buildings.find((v) => v.kind === 'laboratory')!;
    const original = { x: b.x, y: b.y };
    m.saveLayout(0);
    m.dragTo(b.id, 2, 2);
    m.saveLayout(1);
    m.loadLayout(0);
    expect([b.x, b.y]).toEqual([original.x, original.y]);
    m.loadLayout(1);
    expect([b.x, b.y]).toEqual([2, 2]);
    expect(m.layouts).toHaveLength(3);
    expect(validateSave(m.state)).toBe(true);
    m.endEdit();
    expect(m.editing).toBe(false);
    expect(m.canUndo).toBe(false);
  });
});

describe('saves', () => {
  it('migrates a version 1 village and leaves its progress alone', () => {
    const modern = initialSave();
    const legacy = structuredClone(modern) as unknown as Record<string, unknown>;
    legacy.version = 1;
    legacy.gold = 4321;
    delete legacy.spells;
    delete legacy.spellQueue;
    legacy.army = { swordsman: 3, archer: 2, giant: 1, wizard: 1 };
    legacy.troopLevels = { swordsman: 2, archer: 1, giant: 1, wizard: 1 };
    expect(validateSave(legacy)).toBe(false);
    const migrated = migrateSave(legacy) as Save;
    expect(validateSave(migrated)).toBe(true);
    expect(migrated.gold).toBe(4321);
    expect(migrated.army.balloon).toBe(0);
    expect(migrated.troopLevels!.balloon).toBe(1);
    expect(migrated.troopLevels!.swordsman).toBe(2);
    // A version-1 village predates spells entirely and is given the whole current book at
    // zero, however many spells that is by now.
    expect(migrated.spells).toEqual(emptySpells());
    expect(new GameModel(migrated).armySize).toBe(
      3 * TROOPS.swordsman.space +
        2 * TROOPS.archer.space +
        TROOPS.giant.space +
        TROOPS.wizard.space,
    );
  });
  it('rejects a save whose building level exceeds that building maximum', () => {
    const s = developedSave();
    s.buildings.find((b) => b.kind === 'spellfactory')!.level = BUILDINGS.spellfactory.maxLevel + 1;
    expect(validateSave(s)).toBe(false);
  });
});

describe('second-pass behaviour', () => {
  it('keeps the wall tool in hand so a run can be laid in one go', () => {
    const m = new GameModel();
    m.townhall!.level = 3; // TH3 adds room beyond the starter village’s 25 walls.
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.beginBuild('wall');
    expect(m.placement).toBe('wall');
    expect(m.place(2, 2)).toBe(true);
    // Still armed, and nothing is selected, so the next tap lays the next segment.
    expect(m.placement).toBe('wall');
    expect(m.selected).toBeNull();
    expect(m.place(3, 2)).toBe(true);
    expect(m.state.buildings.filter((b) => b.kind === 'wall').length).toBeGreaterThan(2);
    m.state.gold = BUILDINGS.wall.cost;
    expect(m.place(4, 2)).toBe(true);
    // New walls are free; the tool stays armed even with an empty treasury.
    expect(m.state.gold).toBe(0);
    expect(m.placement).toBe('wall');
  });
  it('a felled balloon damages the buildings around it, once', () => {
    const m = new GameModel(developedSave());
    arena(m, [
      ['townhall', 12, 12, 1],
      ['cannon', 20, 20, 1],
    ]);
    const balloon = spawn(m, 'balloon', 13.5, 13.5);
    const [townhall, cannon] = m.battle!.buildings;
    const before = { townhall: townhall.hp, cannon: cannon.hp };
    balloon.hp = 0;
    m.step(0.05);
    expect(townhall.hp).toBeLessThan(before.townhall);
    expect(balloon.spent).toBe(true);
    const after = townhall.hp;
    for (let i = 0; i < 5; i++) m.step(0.05);
    // The blast resolves exactly once, even though the corpse is still in the list.
    expect(townhall.hp).toBe(after);
    expect(cannon.hp).toBe(before.cannon);
  });
  it('a whole drag is one undo step, not one per tile crossed', () => {
    const m = new GameModel(developedSave());
    m.beginEdit();
    const b = m.state.buildings.find((v) => v.kind === 'laboratory')!;
    const from = { x: b.x, y: b.y };
    m.beginDrag();
    for (const [x, y] of [
      [5, 23],
      [4, 23],
      [3, 23],
      [2, 23],
    ])
      expect(m.dragTo(b.id, x, y)).toBe(true);
    expect([b.x, b.y]).toEqual([2, 23]);
    m.undo();
    expect([b.x, b.y]).toEqual([from.x, from.y]);
    expect(m.canUndo).toBe(false);
  });
  it('research runs to every original level behind the required laboratory', () => {
    const m = new GameModel(developedSave());
    const lab = m.state.buildings.find((b) => b.kind === 'laboratory')!;
    const ceiling = maxTroopLevel('swordsman');
    for (let level = 1; level < ceiling; level++) {
      // Late research costs more than any one tier's storage; the purse is not the subject.
      m.state.elixir = 999_999_999;
      lab.level = researchLaboratory('swordsman', level);
      m.researchTroop('swordsman');
      m.tick(m.state.research!.end + 1000);
      expect(m.troopLevel('swordsman')).toBe(level + 1);
    }
    expect(m.troopLevel('swordsman')).toBe(ceiling);
    lab.level = BUILDINGS.laboratory.maxLevel;
    m.researchTroop('swordsman');
    expect(m.state.research).toBeUndefined();
    // The last Laboratory reaches the last level of every troop, which is what makes it worth
    // building: the roster no longer runs out far below it.
    for (const kind of TROOP_KEYS)
      expect(researchLaboratory(kind, maxTroopLevel(kind) - 1), kind).toBeLessThanOrEqual(
        BUILDINGS.laboratory.maxLevel,
      );
    expect(validateSave(m.state)).toBe(true);
  });
  it('counts what the tutorial asks for and carries a spell book into battle', () => {
    const m = new GameModel(developedSave());
    expect(m.state.stats.built ?? 0).toBe(0);
    m.beginBuild('cannon');
    m.place(2, 20);
    expect(m.state.stats.built).toBe(1);
    m.beginBuild('wall');
    m.place(2, 2);
    // Walls are not the lesson, so they do not satisfy it.
    expect(m.state.stats.built).toBe(1);
    expect(m.state.stats.trained ?? 0).toBe(0);
    m.train('archer', 2);
    expect(m.state.stats.trained).toBe(2);
    m.startBattle(0);
    expect(m.battle!.carried).toEqual(m.state.lastSpells);
    m.activeSpell = 'rage';
    m.castSpell(2, 2);
    expect(m.battle!.spells.rage).toBe(0);
    // Spent, but the slot it came from is still recorded for the tray.
    expect(m.battle!.carried.rage).toBe(1);
  });
});
