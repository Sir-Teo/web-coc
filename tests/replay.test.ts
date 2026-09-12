import { describe, expect, it, vi } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';

const combat = (b: Battle) => ({
  buildings: b.buildings,
  units: b.units,
  shells: b.shells,
  projectiles: b.projectiles,
  traps: b.traps,
  hero: b.hero,
  remaining: b.remaining,
  spells: b.spells,
  auras: b.auras,
  elapsed: b.elapsed,
  stars: b.stars,
  destruction: b.destruction,
  loot: b.loot,
  finished: b.finished,
  defenseTargets: b.defenseTargets,
});
function recorded(practice = false) {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings.find((b) => b.kind === 'townhall')!.level = 7;
  m.state.buildings.push(makeBuilding(m.state.nextId++, 'herohall', 23, 23));
  m.state.king = { level: 4 };
  m.state.army = Object.fromEntries(TROOP_KEYS.map((k) => [k, 2])) as typeof m.state.army;
  m.state.spells = { rage: 1, heal: 1, lightning: 1 };
  m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 3])) as typeof m.state.army;
  m.startBattle(0, practice);
  m.step(0.05);
  m.step(0.1);
  expect(m.deploy(14, 14)).toBe(false);
  for (const kind of TROOP_KEYS) {
    m.activeTroop = kind;
    m.deploy(1.2, 13);
    m.step(0.05);
  }
  m.deployHero(1.2, 13);
  m.activateHeroAbility();
  m.activeSpell = 'rage';
  m.castSpell(2, 13);
  for (let i = 0; i < 160; i++) m.step(0.05);
  m.activeSpell = 'lightning';
  m.castSpell(14, 14);
  m.activeSpell = 'heal';
  m.castSpell(5, 13);
  for (let i = 0; i < 200; i++) m.step(0.05);
  m.finishBattle();
  return m;
}
function playToEnd(m: GameModel) {
  let steps = 0;
  while (!m.replay!.complete && steps++ < 5000) m.step(0.05);
  expect(m.replay!.complete).toBe(true);
}
describe('recorded battle playback', () => {
  it('preserves a level-four Wizard fractional hit through JSON and playback', () => {
    const m = new GameModel();
    m.state.obstacles = [];
    m.state.buildings = [makeBuilding(1, 'townhall', 10, 10), makeBuilding(2, 'builder', 30, 30)];
    m.state.nextId = 3;
    m.state.army = Object.fromEntries(
      TROOP_KEYS.map((k) => [k, k === 'wizard' ? 1 : 0]),
    ) as typeof m.state.army;
    m.state.troopLevels = Object.fromEntries(
      TROOP_KEYS.map((k) => [k, Math.min(4, maxTroopLevel(k))]),
    ) as typeof m.state.army;
    m.startBattle(0, true);
    m.activeTroop = 'wizard';
    expect(m.deploy(6, 11.5)).toBe(true);
    const hall = m.battle!.buildings[0];
    for (let i = 0; i < 100 && hall.hp === hall.maxHp; i++) m.step(0.05);
    expect(hall.maxHp - hall.hp).toBe(187.5);
    m.finishBattle();
    const expected = structuredClone(combat(m.battle!));
    const loaded = new GameModel(JSON.parse(JSON.stringify(m.state)));
    expect(validateSave(loaded.state)).toBe(true);
    expect(loaded.startReplay(loaded.state.raidLog![0].id)).toBe(true);
    playToEnd(loaded);
    expect(combat(loaded.battle!)).toEqual(expected);
  });
  for (const practice of [false, true])
    it(`reproduces ${practice ? 'practice' : 'campaign'} combat exactly without touching the save`, () => {
      const m = recorded(practice);
      const expected = structuredClone(combat(m.battle!));
      const record = m.state.raidLog![0];
      expect(validateReplay(record.replay)).toBe(true);
      expect(validateSave(m.state)).toBe(true);
      m.returnHome();
      // A later army, research level, and layout must not change the old attack.
      m.state.troopLevels!.giant = 5;
      m.state.buildings.find((b) => b.kind === 'cannon')!.x = 22;
      m.clearArmy();
      const home = structuredClone(m.state);
      expect(m.startReplay(record.id)).toBe(true);
      expect(m.deploy(1, 1)).toBe(false);
      expect(m.deployHero(1, 1)).toBe(false);
      expect(m.castSpell(10, 10)).toBe(false);
      expect(m.activateHeroAbility()).toBe(false);
      m.finishBattle();
      expect(m.battle!.finished).toBe(false);
      playToEnd(m);
      expect(combat(m.battle!)).toEqual(expected);
      expect(m.state).toEqual(home);
      m.returnHome();
      expect(m.state).toEqual(home);
    });
  it('reproduces concealed traps, mortar fire, and automatic hero activation', () => {
    const m = new GameModel();
    m.state.buildings = [
      makeBuilding(1, 'townhall', 20, 20, 7),
      makeBuilding(2, 'builder', 24, 20),
      makeBuilding(3, 'herohall', 24, 23),
      makeBuilding(4, 'cannon', 4, 12, 8),
      makeBuilding(5, 'mortar', 8, 12, 4),
      makeBuilding(6, 'wizardtower', 8, 8, 8),
      makeBuilding(7, 'bomb', 1, 13),
      makeBuilding(8, 'giantbomb', 1, 14),
      makeBuilding(9, 'springtrap', 3, 13),
      makeBuilding(10, 'airbomb', 2, 13),
      makeBuilding(11, 'cannon', 6, 15, 10), // Crossfire triggers the King’s automatic equipment activation.
    ];
    m.state.nextId = 12;
    m.state.king = { level: 1 };
    m.state.army.balloon = 1;
    m.startBattle(0, true);
    m.deployHero(1.2, 13);
    m.activeTroop = 'balloon';
    m.deploy(1.2, 13);
    let mortar = false;
    for (let i = 0; i < 3601 && !m.battle!.finished; i++) {
      m.step(0.05);
      mortar ||= m.battle!.shells.length > 0;
    }
    m.finishBattle();
    expect(m.battle!.hero!.abilityUsed).toBe(true);
    expect(mortar).toBe(true);
    expect(Object.values(m.battle!.traps).filter((t) => t.resolved).length).toBeGreaterThanOrEqual(
      2,
    );
    const expected = structuredClone(combat(m.battle!));
    expect(m.startReplay(m.state.raidLog![0].id)).toBe(true);
    m.setReplaySpeed(4);
    playToEnd(m);
    expect(combat(m.battle!)).toEqual(expected);
  });
  it('holds research levels fixed during a raid when home research completes', () => {
    const m = new GameModel();
    m.state.research = { kind: 'giant', end: m.clock + 50 };
    m.startBattle(0);
    const damage = m.troopStats('giant').damage;
    m.tick(m.clock + 100);
    expect(m.state.troopLevels!.giant).toBe(2);
    expect(m.troopStats('giant').damage).toBe(damage);
    m.returnHome();
    expect(m.troopStats('giant').damage).toBeGreaterThan(damage);
  });
  it('pauses, changes speed, restarts, and survives JSON export/import', () => {
    const original = recorded();
    const loaded = new GameModel(JSON.parse(JSON.stringify(original.state)));
    expect(loaded.startReplay(loaded.state.raidLog![0].id)).toBe(true);
    loaded.toggleReplay();
    loaded.step(2);
    expect(loaded.replay!.time).toBe(0);
    loaded.setReplaySpeed(4);
    loaded.toggleReplay();
    // Check speed conversion independently of the separately tested 8ms work budget.
    const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
    try {
      loaded.step(0.25);
    } finally {
      clock.mockRestore();
    }
    expect(loaded.replay!.time).toBeCloseTo(1);
    const id = loaded.replay!.recordId;
    loaded.startReplay(id);
    expect(loaded.replay).toMatchObject({ time: 0, speed: 1, paused: false });
    playToEnd(loaded);
    expect(combat(loaded.battle!)).toEqual(combat(original.battle!));
    const result = structuredClone(combat(loaded.battle!));
    loaded.step(10);
    expect(combat(loaded.battle!)).toEqual(result);
  });
  it('records scouting timeout and automatic battle completion', () => {
    const m = new GameModel();
    m.startBattle(0);
    for (let i = 0; i < 4300 && !m.battle!.finished; i++) m.step(0.05);
    const expected = structuredClone(combat(m.battle!));
    expect(m.battle!.finished).toBe(true);
    expect(validateReplay(m.state.raidLog![0].replay)).toBe(true);
    m.startReplay(m.state.raidLog![0].id);
    m.setReplaySpeed(4);
    playToEnd(m);
    expect(combat(m.battle!)).toEqual(expected);
  });
  it('keeps five recordings and twenty results; unavailable versions leave home alone', () => {
    const m = new GameModel();
    for (let i = 0; i < 22; i++) {
      m.startBattle(0, true);
      m.finishBattle();
      m.returnHome();
    }
    expect(m.state.raidLog).toHaveLength(20);
    expect(m.state.raidLog!.filter((r) => r.replay)).toHaveLength(5);
    const home = structuredClone(m.state);
    expect(m.startReplay(m.state.raidLog![5].id)).toBe(false);
    expect(m.state).toEqual(home);
    m.state.raidLog![0].replay!.version++;
    expect(validateSave(m.state)).toBe(true);
    expect(m.startReplay(m.state.raidLog![0].id)).toBe(false);
    expect(m.battle).toBe(null);
  });
  it('rejects malformed and unbounded replay data while accepting legacy result logs', () => {
    const m = recorded();
    for (const mutate of [
      (r: any) => r.steps.push(Infinity),
      (r: any) => (r.actions[0].step = -1),
      (r: any) => (r.actions[0].type = 'arbitrary'),
      (r: any) => (r.initial.buildings[0].kind = '__proto__'),
      (r: any) => r.initial.buildings.push(r.initial.buildings[0]),
      (r: any) => (r.initial.hero.townhall = 999),
      (r: any) => (r.initial.troopLevels.giant = 100),
      (r: any) => (r.actions.at(-1).step = 0),
      (r: any) => (r.actions[0].x = NaN),
    ]) {
      const save = structuredClone(m.state);
      mutate(save.raidLog![0].replay);
      expect(validateSave(save)).toBe(false);
    }
    delete m.state.raidLog![0].replay;
    expect(validateSave(m.state)).toBe(true);
  });
});
