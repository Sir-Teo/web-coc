import { developedSave } from './fixtures/developed-village';
import { describe, it, expect } from 'vitest';
import { GameModel, initialSave, makeBuilding, findPath, distanceTo } from '../src/game/model';
import { BUILDINGS, TROOP_KEYS, TROOPS } from '../src/game/data';
import { validateSave } from '../src/game/save';
describe('village progression', () => {
  it('starts with valid, non-overlapping buildings and an army within capacity', () => {
    const m = new GameModel();
    expect(validateSave(m.state)).toBe(true);
    expect(m.armySize).toBeLessThanOrEqual(m.capacity);
    for (const b of m.state.buildings)
      expect(m.canPlace(b.kind, b.x, b.y, b.id), `${b.kind} ${b.id} overlaps`).toBe(true);
  });
  it('rejects occupied placement without spending and constructs on valid ground', () => {
    const m = new GameModel();
    m.townhall!.level = 5; // The third Cannon unlocks at TH5.
    const gold = m.state.gold;
    m.beginBuild('cannon');
    expect(m.place(11, 10)).toBe(false);
    expect(m.state.gold).toBe(gold);
    expect(m.place(2, 20)).toBe(true);
    expect(m.state.gold).toBe(gold - BUILDINGS.cannon.cost);
    const b = m.state.buildings.at(-1)!;
    expect(b.constructing).toBe(true);
    m.tick(m.clock + BUILDINGS.cannon.build * 1000 + 1000);
    expect(b.constructing).toBe(false);
    expect(b.level).toBe(1);
  });
  it('reserves builders, upgrades once and charges gems to finish', () => {
    const m = new GameModel();
    const b = m.state.buildings.find((b) => b.kind === 'townhall')!;
    m.upgrade(b.id);
    expect(m.busy).toBe(1);
    const gems = m.state.gems;
    m.finish(b.id);
    expect(b.level).toBe(3);
    expect(m.state.gems).toBeLessThan(gems);
    m.tick(m.clock + 99999);
    expect(b.level).toBe(3);
  });
  it('starts new producers empty and leaves unfinished buildings holding their resources', () => {
    const m = new GameModel();
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.state.gold = 0;
    m.state.elixir = 50000;
    m.placement = 'goldmine';
    expect(m.place(2, 2)).toBe(true);
    const fresh = m.state.buildings.at(-1)!;
    expect(fresh.stored).toBe(0);
    expect(fresh.constructing).toBe(true);
    const running = m.state.buildings.find((b) => b.kind === 'goldmine' && b.id !== fresh.id)!;
    running.stored = 4000;
    m.upgrade(running.id);
    expect(running.upgradeEnd).toBeTruthy();
    m.collect(fresh.id);
    m.collect(running.id);
    expect(m.state.gold).toBe(0);
    expect(running.stored).toBe(4000);
    expect(validateSave(m.state)).toBe(true);
  });
  it('says why a collection came back empty', () => {
    const m = new GameModel();
    const messages: string[] = [];
    m.onToast = (t) => messages.push(t);
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    mine.stored = 5000;
    m.state.gold = m.resourceCap('gold');
    m.collect(mine.id);
    expect(messages.at(-1)).toMatch(/full/i);
    expect(mine.stored).toBe(5000);
    const drill = makeBuilding(m.state.nextId++, 'darkdrill', 2, 2);
    drill.stored = 500;
    m.state.buildings.push(drill);
    expect(m.resourceCap('dark')).toBe(0);
    m.collect(drill.id);
    expect(messages.at(-1)).toMatch(/Dark Elixir Storage/);
    expect(m.state.dark).toBe(0);
  });
  it('never converts stored fields on non-producers into collectible resources', () => {
    const m = new GameModel();
    m.state.gold = m.state.elixir = 0;
    for (const b of m.state.buildings) b.stored = b.kind === 'goldstorage' ? 50000 : 0;
    const collected = m.state.stats.collected;
    m.collect();
    expect(m.state.gold).toBe(0);
    expect(m.state.elixir).toBe(0);
    expect(m.state.stats.collected).toBe(collected);
    expect(m.state.buildings.find((b) => b.kind === 'goldstorage')!.stored).toBe(50000);
  });
  it('requires an available builder for walls without reserving it afterward', () => {
    const m = new GameModel();
    m.state.obstacles = []; // Cleared ground for this placement scenario.
    m.state.gold = 9_000_000;
    m.state.elixir = 9_000_000;
    m.townhall!.level = 8;
    const cannons = m.state.buildings.filter((b) => b.kind === 'cannon');
    m.upgrade(cannons[0].id);
    m.upgrade(cannons[1].id);
    expect(m.busy).toBe(m.builders);
    const wall = m.state.buildings.find((b) => b.kind === 'wall')!;
    m.upgrade(wall.id);
    expect(wall.upgradeEnd).toBeUndefined();
    expect(wall.level).toBe(2);
    m.placement = 'wall';
    expect(m.place(2, 2)).toBe(false);
    delete cannons[0].upgradeEnd;
    m.upgrade(wall.id);
    expect(wall.level).toBe(3);
    expect(wall.upgradeEnd).toBeUndefined();
    expect(m.place(2, 2)).toBe(true);
    expect(m.busy).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });
  it('limits offline generation and prevents collecting beyond storage capacity', () => {
    const m = new GameModel();
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    mine.stored = 0;
    m.tick(m.clock + 24 * 3600000);
    expect(mine.stored).toBe(10000 * mine.level);
    m.state.gold = m.resourceCap('gold') - 5;
    m.collect(mine.id);
    expect(m.state.gold).toBe(m.resourceCap('gold'));
    expect(mine.stored).toBe(10000 * mine.level - 5);
  });
  it('prepares instantly for free and respects camp capacity', () => {
    const m = new GameModel(developedSave());
    const before = m.state.elixir;
    const wizardCount = m.state.army.wizard;
    m.train('archer');
    m.train('wizard');
    expect(m.state.elixir).toBe(before);
    expect(m.state.queue).toHaveLength(0);
    expect(m.state.army.archer).toBe(11);
    expect(m.state.army.wizard).toBe(wizardCount + 1);
    expect(m.state.queue).toHaveLength(0);
    m.train('giant');
    expect(m.state.queue).toHaveLength(0);
  });
  it('rejects malformed or unsupported save data', () => {
    expect(validateSave({})).toBe(false);
    const s = initialSave();
    s.buildings[0].kind = 'bad' as never;
    expect(validateSave(s)).toBe(false);
    const s2 = initialSave();
    s2.army.archer = -1;
    expect(validateSave(s2)).toBe(false);
  });
});
describe('combat', () => {
  it('paths around occupied buildings to reach a target', () => {
    const target = makeBuilding(1, 'townhall', 12, 12),
      obstacle = makeBuilding(2, 'goldstorage', 8, 12);
    const path = findPath({ x: 6, y: 13 }, target, [target, obstacle], 1);
    expect(path.length).toBeGreaterThan(0);
    expect(path.some((p) => p.x >= 8 && p.x < 11 && p.y >= 12 && p.y < 15)).toBe(false);
    expect(distanceTo(path.at(-1)!, target)).toBeLessThanOrEqual(1);
  });
  it('locks campaign progress and rejects deployment inside enemy footprints', () => {
    const m = new GameModel();
    m.startBattle(1);
    expect(m.battle).toBeNull();
    m.startBattle(0);
    expect(m.deploy(12, 12)).toBe(false);
    expect(m.state.army.swordsman).toBe(12);
    expect(m.deploy(3, 12)).toBe(true);
    expect(m.state.army.swordsman).toBe(11);
    expect(m.battle!.remaining.swordsman).toBe(11);
  });
  it('a full starting army can complete the opening raid through actual simulation', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.state.spells = { rage: 0, heal: 0, lightning: 0 };
    m.battle!.spells = { rage: 0, heal: 0, lightning: 0 };
    for (const kind of [
      'giant',
      'wallbreaker',
      'swordsman',
      'archer',
      'wizard',
      'balloon',
      'goblin',
    ] as const) {
      m.activeTroop = kind;
      let i = 0;
      while (m.battle!.remaining[kind] > 0) {
        expect(m.deploy(4 + (i % 3) * 0.3, 10 + (i % 4) * 0.5)).toBe(true);
        i++;
      }
    }
    for (let i = 0; i < 3600 && !m.battle!.finished; i++) m.step(0.05);
    console.log('Opening raid', m.battle!.result);
    expect(m.battle!.finished).toBe(true);
    expect(m.battle!.stars).toBeGreaterThanOrEqual(1);
    expect(m.state.stars[0]).toBeGreaterThanOrEqual(1);
    const gold = m.state.gold;
    m.finishBattle();
    expect(m.state.gold).toBe(gold);
    m.returnHome();
    expect(m.armySize).toBe(0);
  });
  it('preserves undeployed troops when returning from scouting', () => {
    const m = new GameModel();
    const army = { ...m.state.army };
    m.startBattle(0);
    m.returnHome();
    expect(m.state.army).toEqual(army);
  });
});

describe('late progression and combat quality', () => {
  it('only produces resources after an offline upgrade completes', () => {
    const m = new GameModel();
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    mine.stored = 0;
    const start = m.clock;
    m.upgrade(mine.id);
    const end = mine.upgradeEnd!;
    m.tick(end + 10000);
    expect(mine.stored).toBe(10 * 3 * mine.level);
    expect(m.clock).toBeGreaterThan(start);
  });
  it('crowded units separate without entering a solid building', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.activeTroop = 'swordsman';
    m.deploy(4, 11);
    m.deploy(4, 11);
    m.step(0.05);
    const [a, b] = m.battle!.units;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.01);
    for (let i = 0; i < 80; i++) m.step(0.05);
    for (const u of m.battle!.units)
      expect(
        m.battle!.buildings.some(
          (v) =>
            v.hp > 0 &&
            u.x > v.x &&
            u.x < v.x + BUILDINGS[v.kind].size &&
            u.y > v.y &&
            u.y < v.y + BUILDINGS[v.kind].size,
        ),
      ).toBe(false);
  });
});

it('awards quest gems once and preserves claims in saved state', () => {
  const m = new GameModel();
  const gems = m.state.gems;
  expect(m.claimQuest('first-raid')).toBe(false);
  m.state.stats.raids = 1;
  expect(m.claimQuest('first-raid')).toBe(true);
  expect(m.state.gems).toBe(gems + 20);
  expect(m.claimQuest('first-raid')).toBe(false);
  expect(m.state.gems).toBe(gems + 20);
  const restored = new GameModel(structuredClone(m.state));
  expect(restored.claimQuest('first-raid')).toBe(false);
  expect(validateSave(restored.state)).toBe(true);
});
