import { expect, it } from 'vitest';
import { GameModel, initialSave, makeBuilding, raidHeroes } from '../src/game/model';
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

it('fills the remaining room and removes every unit of a type in one step', () => {
  const m = new GameModel();
  m.clearArmy();
  const room = m.troopRoom('swordsman');
  expect(room).toBe(m.capacity);
  expect(m.fillTroop('swordsman')).toBe(room);
  expect(m.state.army.swordsman).toBe(room);
  expect(m.troopRoom('archer')).toBe(0);
  expect(m.fillTroop('archer')).toBe(0);
  m.removeTroop('swordsman', Infinity);
  expect(m.state.army.swordsman).toBe(0);
  // Spells fill their own housing.
  m.state.buildings.push(makeBuilding(9100, 'spellfactory', 40, 40, 3));
  const spells = m.spellRoom('lightning');
  expect(spells).toBeGreaterThan(0);
  expect(m.fillSpell('lightning')).toBe(spells);
  m.removeSpell('lightning', Infinity);
  expect(m.state.spells.lightning).toBe(0);
});

it('Quick armies keep the hero lineup, items and pets and report substitutions', () => {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 20, 20, 9),
    makeBuilding(2, 'herohall', 4, 4, 3),
    makeBuilding(3, 'builder', 30, 30),
    makeBuilding(4, 'blacksmith', 8, 4),
    makeBuilding(5, 'camp', 12, 12, 5),
  ];
  m.state.nextId = 10;
  m.state.king = { level: 10 };
  m.state.heroes = { queen: { level: 5 } };
  m.state.army = { ...emptyArmy(), swordsman: 5 };
  m.state.heroLineup = ['queen', 'king'];
  expect(m.equipItem('king', 'earthquake-boots', 0)).toBe(true);
  m.saveArmyPreset(0, 'Heroes');
  const preset = m.state.armyPresets![0]!;
  expect(preset.heroes!.map((h) => h.kind)).toEqual(['queen', 'king']);
  expect(preset.heroes![1].items).toEqual(['earthquake-boots', 'rage-vial']);
  expect(validateSave(m.state)).toBe(true);
  // Change everything, then load the preset back.
  m.state.heroLineup = ['king', 'queen'];
  m.equipItem('king', 'barbarian-puppet', 0);
  m.loadArmyPreset(0);
  expect(m.heroLineup).toEqual(['queen', 'king']);
  expect(m.gear.loadouts.king).toEqual(['earthquake-boots', 'rage-vial']);
  // A hero this village no longer has is named rather than silently dropped.
  delete m.state.heroes!.queen;
  const plan = m.presetHeroPlan(preset);
  expect(plan.lineup.map((h) => h.kind)).toEqual(['king']);
  expect(plan.changes.join()).toContain('Archer Queen');
});

it('explains why an upgrade cannot start, in the order upgrade() checks', () => {
  const m = new GameModel();
  const th = m.townhall!;
  m.state.gold = 0;
  expect(m.upgradeIssue(th)?.reason).toMatch(/^Need [\d,]+ more gold\.$/);
  m.state.gold = m.resourceCap('gold');
  expect(m.upgradeIssue(th)).toBeNull();
  // Every builder busy outranks the price.
  const others = m.state.buildings.filter((b) => b.kind === 'cannon').slice(0, m.builders);
  for (const b of others) {
    b.upgradeStart = m.clock;
    b.upgradeEnd = m.clock + 60_000;
  }
  expect(m.upgradeIssue(th)?.reason).toBe(`All ${m.builders} builders are busy.`);
  // The card and the action agree: upgrade() refuses for the same reason.
  const gold = m.state.gold;
  m.upgrade(th.id);
  expect(th.upgradeEnd).toBeUndefined();
  expect(m.state.gold).toBe(gold);
});
