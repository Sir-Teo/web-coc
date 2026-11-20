import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';

function village(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 35, 35, 16),
    makeBuilding(2, 'pethouse', 35, 29, 9),
    makeBuilding(3, 'herohall', 28, 35, 3),
  ];
  model.state.king = { level: 1 };
  model.state.heroes = { queen: { level: 1 } };
  model.state.heroLineup = ['queen'];
  model.state.pets = { levels: { fox: level }, assigned: {} };
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.settings.manualHeroAbilities = true;
  expect(model.assignPet('king', 'fox')).toBe(true);
  expect(model.assignPet('queen', 'fox')).toBe(true);
  expect(model.petProgress.assigned).toEqual({ queen: 'fox' });
  model.startBattle(0, true);
  if (version !== REPLAY_VERSION) {
    const record = (model as unknown as { recording: ReplayData }).recording;
    model.battle = replayBattle(record.initial, version);
  }
  const battle = model.battle!;
  expect(model.deployNativeHero('queen', 10, 10)).toBe(true);
  const owner = battle.nativeHeroes!.find(({ kind }) => kind === 'queen')!;
  const hero = battle.units.find(({ id }) => id === owner.unitId)!;
  const pet = battle.units.find(({ id }) => id === owner.petId)!;
  const until = (time: number) => {
    while (battle.elapsed < time - 1e-9) model.step(0.05);
  };
  return { hero, pet, owner, until, battle };
}

it.each([
  [1, 3],
  [5, 3.5],
  [10, 4],
])(
  'Spirit Fox level %s conceals both on deployment and only itself after defeat',
  (level, duration) => {
    const { hero, pet, owner, until } = village(level);
    expect(hero.native?.effects?.invisibleUntil).toBe(duration);
    expect(pet.native?.effects?.invisibleUntil).toBe(duration);
    const second = duration + 6;
    expect(owner.spiritFoxNextAt).toBe(second);
    until(duration + 0.05);
    hero.hp = 0;
    pet.cooldown = 100;
    until(second - 0.05);
    expect(pet.native?.effects?.invisibleUntil).toBe(duration);
    until(second);
    expect(pet.native?.effects?.invisibleUntil).toBe(second + duration);
    expect(hero.native?.effects?.invisibleUntil).toBe(duration);
    expect(owner.spiritFoxNextAt).toBe(2 * second);
  },
);

it('does not renew concealment when the pet is no longer on the field', () => {
  const { hero, pet, owner, until } = village();
  pet.hp = 0;
  until(9.05);
  expect(hero.native?.effects?.invisibleUntil).toBe(3);
  expect(pet.native?.effects?.invisibleUntil).toBe(3);
  expect(owner.spiritFoxNextAt).toBe(9);
});

it('keeps version 254 Spirit Fox behavior unchanged', () => {
  const { hero, pet, owner, battle, until } = village(1, 254);
  until(9.05);
  expect(battle.nativeSpiritFox).toBeUndefined();
  expect(hero.native?.effects?.invisibleUntil).toBeUndefined();
  expect(pet.native?.effects?.invisibleUntil).toBeUndefined();
  expect(owner.spiritFoxNextAt).toBeUndefined();
});
