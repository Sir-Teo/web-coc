import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { hurtUnit, unitHidden, unitTriggersTraps } from '../src/game/native-status';
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
    makeBuilding(5, 'cannon', 16, 10, 21),
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
  const pet = battle.units.find(({ id }) => id === owner.petId)!;
  const until = (time: number) => {
    while (battle.elapsed < time - 1e-9) model.step(0.05);
  };
  return { hero, owner, pet, until, battle };
}

it.each([
  [1, 25],
  [5, 30],
  [10, 35],
])('Angry Jelly level %s grants its hero defense preference for %ss', (level, duration) => {
  const { hero, owner, pet, until, battle } = village(level);
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

it('attacks an in-range defense from the hero position while protected', () => {
  const { hero, pet, until, battle } = village();
  const cannon = battle.buildings.find(({ id }) => id === 5)!;
  expect(cannon.x - pet.x).toBe(6);
  expect(statsFor(battle, pet).range).toBe(5);
  expect(pet.native?.jellyAttachedRange).toBe(7);
  expect(unitHidden(pet, battle.elapsed)).toBe(true);
  expect(unitTriggersTraps(pet)).toBe(false);
  expect(hurtUnit(battle, pet, 100)).toBe(0);
  until(0.05);
  expect(cannon.hp).toBeLessThan(cannon.maxHp);
  until(0.2);
  expect(pet).toMatchObject({ x: hero.x, y: hero.y, target: 5, attacking: true });
  expect(pet.cooldown).toBeGreaterThan(0);
  cannon.hp = 0;
  until(0.25);
  expect(pet.target).toBeNull();
  expect(pet.attacking).toBe(false);
  hero.hp = 0;
  until(0.3);
  expect(pet.native?.jellyAttachedRange).toBeUndefined();
  expect(unitHidden(pet, battle.elapsed)).toBe(false);
  expect(unitTriggersTraps(pet)).toBe(true);
  expect(hurtUnit(battle, pet, 100)).toBe(100);
});

it('keeps version 256 Jelly independently targetable while its hero is Brainwashed', () => {
  const { hero, pet, until, battle } = village(1, 256);
  until(0.05);
  expect(hero.target).toBe(5);
  expect(pet.native?.jellyAttachedRange).toBeUndefined();
  expect(unitHidden(pet, battle.elapsed)).toBe(false);
  expect(unitTriggersTraps(pet)).toBe(true);
});
