import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { statsFor } from '../src/game/native-troops';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';

function village(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 35, 35, 16),
    makeBuilding(2, 'pethouse', 35, 29, 10),
    makeBuilding(4, 'goldstorage', 12, 10, 14),
    makeBuilding(5, 'cannon', 18, 10, 21),
    makeBuilding(3, 'herohall', 28, 35, 3),
  ];
  model.state.king = { level: 1 };
  model.state.heroes = { queen: { level: 1 } };
  model.state.heroLineup = ['queen'];
  model.state.pets = { levels: { jelly: level }, assigned: {} };
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.settings.manualHeroAbilities = true;
  expect(model.assignPet('king', 'jelly')).toBe(true);
  expect(model.assignPet('queen', 'jelly')).toBe(true);
  expect(model.petProgress.assigned).toEqual({ queen: 'jelly' });
  model.startBattle(0, true);
  if (version !== REPLAY_VERSION) {
    const record = (model as unknown as { recording: ReplayData }).recording;
    model.battle = replayBattle(record.initial, version);
  }
  const battle = model.battle!;
  expect(model.deployNativeHero('queen', 10, 10)).toBe(true);
  const owner = battle.nativeHeroes!.find(({ kind }) => kind === 'queen')!;
  const hero = battle.units.find(({ id }) => id === owner.unitId)!;
  const until = (time: number) => {
    while (battle.elapsed < time - 1e-9) model.step(0.05);
  };
  return { hero, owner, until, battle };
}

it.each([
  [1, 25],
  [5, 30],
  [10, 35],
])('Angry Jelly level %s grants its hero defense preference for %ss', (level, duration) => {
  const { hero, owner, until, battle } = village(level);
  expect(owner.jellyBrainwashUntil).toBe(duration);
  expect(statsFor(battle, hero)).toMatchObject({ preferredClass: 'Defense', groups: false });
  until(0.05);
  expect(hero.target).toBe(5);
  hero.hp = 100000;
  until(duration - 0.05);
  expect(statsFor(battle, hero).preferredClass).toBe('Defense');
  until(duration);
  expect(statsFor(battle, hero).preferredClass).not.toBe('Defense');
});

it('keeps the original Queen target preference in version 255 recordings', () => {
  const { hero, owner, until } = village(1, 255);
  until(0.05);
  expect(owner.jellyBrainwashUntil).toBeUndefined();
  expect(hero.target).toBe(4);
});

it('ends Brainwash after knockout so the same hero cannot regain it on revival', () => {
  const { hero, owner, until, battle } = village();
  until(0.05);
  hero.hp = 0;
  until(0.1);
  expect(owner.jellyBrainwashUntil).toBe(0);
  hero.hp = 50;
  expect(statsFor(battle, hero).preferredClass).not.toBe('Defense');
});
