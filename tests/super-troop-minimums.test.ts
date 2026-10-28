import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { superMinimum } from '../src/game/special-troops';
import type { TroopKind } from '../src/game/data';

// Client MinOriginalLevel is a zero-based index; these are the actual research levels.
const requirements = [
  ['superbarbarian', 'swordsman', 8],
  ['sneakygoblin', 'goblin', 7],
  ['supergiant', 'giant', 9],
  ['superwallbreaker', 'wallbreaker', 7],
  ['superarcher', 'archer', 8],
  ['superwitch', 'witch', 5],
  ['infernodragon', 'babydragon', 6],
  ['supervalkyrie', 'valkyrie', 7],
  ['superminion', 'minion', 8],
  ['superwizard', 'wizard', 9],
  ['icehound', 'lavahound', 5],
  ['rocketballoon', 'balloon', 8],
  ['superbowler', 'bowler', 4],
  ['superdragon', 'dragon', 7],
  ['superminer', 'miner', 7],
  ['superhogrider', 'hogrider', 10],
  ['superyeti', 'yeti', 3],
] as const;

function village(original: TroopKind, level: number) {
  const m = new GameModel();
  m.state.king = undefined;
  m.state.obstacles = [];
  m.state.buildings = [makeBuilding(1, 'townhall', 24, 24, 18)];
  m.state.buildings.push(
    makeBuilding(2, 'barracks', 8, 8, m.maxLevel('barracks')),
    makeBuilding(3, 'darkbarracks', 12, 8, m.maxLevel('darkbarracks')),
    makeBuilding(4, 'camp', 18, 8, m.maxLevel('camp')),
  );
  m.state.nextId = 100;
  m.state.army = emptyArmy();
  m.state.troopLevels = { ...m.state.troopLevels, [original]: level };
  m.state.dark = 100000;
  return m;
}

for (const [kind, original, minimum] of requirements) {
  it(`${kind} requires ${original} research ${minimum} before spending dark elixir`, () => {
    expect(superMinimum(kind)).toBe(minimum);
    const m = village(original, minimum - 1),
      before = JSON.stringify(m.state);
    m.boostSuperTroop(kind);
    expect(JSON.stringify(m.state)).toBe(before);
    expect(m.troopUnlocked(kind)).toBe(false);
    m.state.troopLevels![original] = minimum;
    const clock = m.clock;
    m.boostSuperTroop(kind);
    expect(m.state.dark).toBe(75000);
    expect(m.state.superBoosts![kind]).toBe(clock + 72 * 3600000);
    expect(m.troopUnlocked(kind)).toBe(true);
    m.train(kind);
    expect(m.state.army[kind]).toBe(1);
  });
  it(`${kind} rejects an early Super Potion and consumes it only at research ${minimum}`, () => {
    const m = village(original, minimum - 1);
    m.state.dark = 0;
    m.addMagicItem('super-potion', 1);
    const before = JSON.stringify(m.state);
    expect(m.useSuperPotion(kind)).toBe(false);
    expect(JSON.stringify(m.state)).toBe(before);
    expect(m.magicItemCount('super-potion')).toBe(1);
    m.state.troopLevels![original] = minimum;
    expect(m.useSuperPotion(kind)).toBe(true);
    expect(m.magicItemCount('super-potion')).toBe(0);
    expect(m.state.dark).toBe(0);
    expect(m.state.superBoosts![kind]).toBe(m.clock + 72 * 3600000);
    expect(m.troopUnlocked(kind)).toBe(true);
  });
}

it('keeps the non-Super minimum contract at zero', () => {
  expect(superMinimum('minion')).toBe(0);
  expect(superMinimum('swordsman')).toBe(0);
});

it('retains old boost deadlines and prepared troops while blocking new below-minimum training', () => {
  const m = village('minion', 7),
    end = m.clock + 3600000;
  m.state.superBoosts = { superminion: end };
  m.state.army.superminion = 1;
  const before = JSON.stringify(m.state);
  expect(m.troopUnlocked('superminion')).toBe(false);
  m.train('superminion');
  m.boostSuperTroop('superminion');
  expect(JSON.stringify(m.state)).toBe(before);
  expect(m.state.superBoosts.superminion).toBe(end);
  m.startBattle(0, true);
  m.activeHero = false;
  m.activeHeroKind = null;
  m.activeTroop = 'superminion';
  expect(m.deploy(1, 1)).toBe(true);
  expect(m.battle!.units.find((u) => u.kind === 'superminion')).toBeDefined();
});
