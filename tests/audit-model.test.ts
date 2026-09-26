import { expect, it } from 'vitest';
import { GameModel, initialSave, raidHeroes } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { validateSave } from '../src/game/save';
import { freshNativeCampaign } from '../src/game/native-campaign';

it('a raid abandoned without a star is completed, not won', () => {
  const m = new GameModel();
  m.state.army = { ...emptyArmy(), swordsman: 5 };
  m.startCampaign(0);
  m.activeTroop = 'swordsman';
  for (const [x, y] of [
    [2, 2],
    [2, 45],
    [45, 2],
    [45, 45],
  ])
    if (!m.deployBlocked(x, y)) {
      m.deploy(x, y);
      break;
    }
  m.finishBattle();
  expect(m.battle!.stars).toBe(0);
  m.returnHome();
  expect(m.state.stats.raids).toBe(1);
  expect(m.state.stats.wins).toBe(0);
  expect(validateSave(m.state)).toBe(true);
});

it('seeds victories for older saves from the villages that hold a star', () => {
  const save = initialSave();
  delete save.stats.wins;
  save.stats.raids = 7;
  save.nativeCampaign = freshNativeCampaign();
  save.nativeCampaign.stars[0] = 3;
  save.nativeCampaign.stars[1] = 1;
  const m = new GameModel(save);
  expect(m.state.stats.wins).toBe(2);
});

it('the battle log names every deployed hero rather than a single King', () => {
  const m = new GameModel();
  m.state.army = { ...emptyArmy(), swordsman: 1 };
  m.startBattle(0, true);
  m.battle!.nativeHeroRoster = true;
  m.battle!.nativeHeroes = [
    { kind: 'queen', level: 3, items: [], unitId: null },
    { kind: 'prince', level: 2, items: [], unitId: null },
    { kind: 'warden', level: 1, items: [], unitId: null },
  ];
  const edge = [0.5, 1, 1.5, 2]
    .flatMap((x) => [0.5, 1, 1.5, 2, 45, 46].map((y) => [x, y]))
    .filter(([x, y]) => !m.deployBlocked(x, y));
  expect(m.deployNativeHero('queen', edge[0][0], edge[0][1])).toBe(true);
  expect(m.deployNativeHero('prince', edge[1][0], edge[1][1])).toBe(true);
  m.finishBattle();
  const record = m.state.raidLog![0];
  expect(record.hero).toBeUndefined();
  expect(raidHeroes(record)).toEqual([
    { kind: 'queen', level: 3, abilityUsed: false },
    { kind: 'prince', level: 2, abilityUsed: false },
  ]);
  // An entry written before the roster reads as the Barbarian King.
  expect(raidHeroes({ hero: { level: 5, abilityUsed: true } })).toEqual([
    { kind: 'king', level: 5, abilityUsed: true },
  ]);
});

it('every quest can be completed through normal play', () => {
  const m = new GameModel();
  const ids = m.quests.map((q) => q.id);
  expect(ids).not.toContain('high-flier');
  const raider = m.quests.find((q) => q.id === 'goblin-raider')!;
  m.state.stats.wins = raider.target;
  expect(m.quests.find((q) => q.id === 'goblin-raider')!.progress).toBe(raider.target);
  expect(m.claimQuest('goblin-raider')).toBeTruthy();
  expect(validateSave(m.state)).toBe(true);
  // A save that claimed the retired quest still loads.
  m.state.claimedQuests = [...(m.state.claimedQuests ?? []), 'high-flier'];
  expect(validateSave(m.state)).toBe(true);
});

it('reduced motion combines the device preference with an explicit override', () => {
  const m = new GameModel();
  expect(m.reducedMotion).toBe(false);
  m.systemReducedMotion = true;
  expect(m.reducedMotion).toBe(true);
  m.toggleReducedMotion();
  expect(m.reducedMotion).toBe(false);
  expect(m.state.settings.fullMotion).toBe(true);
  expect(validateSave(m.state)).toBe(true);
  m.toggleReducedMotion();
  expect(m.reducedMotion).toBe(true);
  expect(m.state.settings.fullMotion).toBeUndefined();
  m.systemReducedMotion = false;
  expect(m.reducedMotion).toBe(true);
});

it('checkpoints an open raid as settled without touching the live battle', () => {
  const m = new GameModel();
  m.state.army = { ...emptyArmy(), swordsman: 5 };
  m.startCampaign(0);
  m.activeTroop = 'swordsman';
  const [x, y] = [
    [2, 2],
    [2, 45],
    [45, 2],
    [45, 45],
  ].find(([x, y]) => !m.deployBlocked(x, y))!;
  expect(m.deploy(x, y)).toBe(true);
  for (let i = 0; i < 40; i++) m.step(0.05);
  const live = structuredClone(m.state);
  const checkpoint = m.settledState();
  // The checkpoint records the raid: its log entry and the spent troop.
  expect(checkpoint.raidLog).toHaveLength(1);
  expect(checkpoint.stats.raids).toBe(1);
  expect(checkpoint.army.swordsman).toBe(4);
  expect(validateSave(checkpoint)).toBe(true);
  // The running raid carries on untouched.
  expect(m.state).toEqual(live);
  expect(m.battle?.finished).toBe(false);
  // Scouting alone commits nothing.
  const scouting = new GameModel();
  scouting.state.army = { ...emptyArmy(), swordsman: 5 };
  scouting.startCampaign(0);
  expect(scouting.settledState()).toEqual(scouting.state);
});
