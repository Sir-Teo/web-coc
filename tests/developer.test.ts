import { developedSave } from './fixtures/developed-village';
import { it, expect } from 'vitest';
import { DeveloperControls } from '../src/dev/controls';
import { developerToolsEnabled } from '../src/dev/access';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';

it('requires explicit opt-in and development, an exact loopback host, or the hosted game', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]', '::1', 'coc.teozeng.dev']) {
    expect(developerToolsEnabled(false, host, '?devtools=1')).toBe(true);
    expect(developerToolsEnabled(false, host, '')).toBe(false);
    expect(developerToolsEnabled(false, host, '?devtools=0')).toBe(false);
  }
  for (const host of ['coc.teozeng.dev.example.com', 'localhost.example.com', '192.168.0.20'])
    expect(developerToolsEnabled(false, host, '?devtools=1')).toBe(false);
  expect(developerToolsEnabled(true, '192.168.0.20', '?devtools=1')).toBe(true);
  expect(developerToolsEnabled(true, 'localhost', '?devtools=0')).toBe(false);
});
it('sets resources and over-capacity armies while keeping saves valid', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m);
  dev.setResources({ gold: 9999999, elixir: 8888888, dark: 77777, gems: 10000 });
  dev.setArmy({ giant: 500, archer: 300 }, { rage: 99 });
  expect(m.armySize).toBeGreaterThan(m.capacity);
  expect(m.state.gold).toBe(9999999);
  expect(m.state.army.giant).toBe(500);
  expect(m.state.spells.rage).toBe(99);
  expect(validateSave(m.state)).toBe(true);
});
it('rejects invalid multi-field edits atomically and blocks village changes in battle', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m),
    before = structuredClone(m.state);
  expect(() => dev.setResources({ gold: 123, elixir: NaN })).toThrow();
  expect(() => dev.setArmy({ archer: 3, giant: -1 })).toThrow();
  expect(() => dev.setArmy({}, { rage: 1000 })).toThrow();
  expect(m.state).toEqual(before);
  m.startBattle(0);
  expect(() => dev.setResources({ gold: 0 })).toThrow('Return home');
  expect(() => dev.finishTimers()).toThrow('Return home');
  expect(() => dev.checkpoint()).toThrow('Return home');
});
it('checkpoint restoration isolates copies, cancels battle and preserves user settings', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m);
  const original = m.state.gold;
  dev.setResources({ gold: 5 });
  const copy = dev.checkpointSave;
  copy.gold = 1;
  m.startBattle(0);
  m.state.settings.sound = false;
  dev.restore();
  expect(m.battle).toBeNull();
  expect(m.state.gold).toBe(original);
  expect(m.state.settings.sound).toBe(false);
  dev.setResources({ gold: 100 });
  const saved = dev.checkpoint();
  dev.setResources({ gold: 999 });
  new DeveloperControls(m, saved).restore();
  expect(m.state.gold).toBe(100);
  expect(validateSave(m.state)).toBe(true);
});
it('completes all construction and research without advancing the wall clock or charging', () => {
  const m = new GameModel(developedSave()),
    dev = new DeveloperControls(m);
  m.upgrade(m.state.buildings.find((b) => b.kind === 'cannon')!.id);
  m.state.buildings.find((b) => b.kind === 'laboratory')!.level = 2;
  m.researchTroop('archer');
  const resources = { gold: m.state.gold, elixir: m.state.elixir, gems: m.state.gems };
  dev.finishTimers();
  expect(m.busy).toBe(0);
  expect(m.state.research).toBeUndefined();
  expect(m.troopLevel('archer')).toBe(2);
  expect(m.state).toMatchObject(resources);
  expect(m.clock).toBeLessThanOrEqual(Date.now());
  expect(validateSave(m.state)).toBe(true);
});
it('sets Town Hall, maxes existing buildings, unlocks and levels the King consistently', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m);
  dev.unlockKing();
  expect(m.townhallLevel).toBe(4);
  expect(m.heroReady).toBe(true);
  expect(() => dev.setKingLevel(10)).toThrow();
  dev.setTownHall(8);
  dev.maxBuildings();
  dev.maxResearch();
  dev.setKingLevel(20);
  dev.unlockKing();
  expect(m.countOf('herohall')).toBe(1);
  expect(m.heroHall!.level).toBe(2);
  expect(m.state.king!.level).toBe(20);
  expect(m.troopLevel('giant')).toBe(5);
  expect(validateSave(m.state)).toBe(true);
});
it('fills supported capacities and unlocks campaign without lowering existing stars', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m);
  m.state.stars[0] = 3;
  dev.fillResources();
  expect(m.state.gold).toBe(m.resourceCap('gold'));
  expect(m.state.dark).toBe(m.resourceCap('dark'));
  expect(m.state.gems).toBe(10000);
  dev.unlockCampaign();
  expect(m.state.stars).toEqual([3, ...Array(11).fill(1)]);
});
it('finishes attacks through normal scoring once and restores the preceding checkpoint', () => {
  const m = new GameModel(),
    dev = new DeveloperControls(m);
  m.startBattle(0, true);
  dev.endBattle(true);
  expect(m.battle!.stars).toBe(3);
  expect(m.battle!.finished).toBe(true);
  expect(m.state.raidLog).toHaveLength(1);
  expect(() => dev.endBattle(true)).toThrow();
  dev.restore();
  expect(m.state.raidLog?.length ?? 0).toBe(0);
  expect(validateSave(m.state)).toBe(true);
});
