import { expect, it } from 'vitest';
import { emptyArmy, emptySpells } from '../src/game/army';
import { GameModel, makeBuilding } from '../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../src/game/replay';

function raid(version: number) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 35, 35, 18),
    makeBuilding(2, 'pethouse', 35, 29, 12),
    makeBuilding(3, 'herohall', 28, 35, 12),
    makeBuilding(4, 'goldstorage', 19, 20, 12),
  ];
  model.state.heroes = { queen: { level: 20 } };
  model.state.heroLineup = ['queen'];
  model.state.pets = { levels: { crow: 1 }, assigned: { queen: 'crow' } };
  model.state.army = { ...emptyArmy(), archer: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.state.settings.manualHeroAbilities = true;
  model.startBattle(0, true);
  const { recording } = model as unknown as { recording: ReplayData };
  const battle = (model.battle = replayBattle(recording.initial, version));
  const owner = battle.nativeHeroes!.find(({ kind }) => kind === 'queen')!;
  const run = (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += 0.05) model.step(0.05);
  };
  expect(model.deployNativeHero('queen', 13, 21)).toBe(true);
  const hero = battle.units.find(({ id }) => id === owner.unitId)!;
  const raven = battle.units.find(({ id }) => id === owner.petId)!;
  hero.hp -= 100;
  owner.abilityUsed = true;
  model.activeSpell = 'recall';
  expect(model.castSpell(13, 21)).toBe(true);
  run(1);
  expect(owner.unitId).toBeNull();
  expect(owner.recalledHp).toBe(hero.hp);
  return { model, battle, owner, raven, hero, run };
}

it.each([true, false])('keeps the same Raven after hero Recall (survives=%s)', (survives) => {
  const { model, battle, owner, raven, hero, run } = raid(REPLAY_VERSION);
  expect(owner.petId).toBe(raven.id);
  expect(raven.native?.recalled).toBeFalsy();
  const storage = battle.buildings.find(({ id }) => id === 4)!;
  const hp = storage.hp;
  run(2);
  expect(storage.hp).toBeLessThan(hp);
  if (!survives) {
    raven.hp = 0;
    run(0.1);
  }
  expect(model.deployNativeHero('queen', 13, 21)).toBe(true);
  expect(owner.petId).toBe(raven.id);
  expect(battle.units.filter(({ kind }) => kind === 'greedyraven')).toEqual([raven]);
  expect(owner.abilityUsed).toBe(true);
  expect(battle.units.find(({ id }) => id === owner.unitId)?.hp).toBe(hero.hp);
});

it('retains paired Raven Recall for version 265', () => {
  const { model, owner, raven } = raid(265);
  expect(owner.petId).toBeNull();
  expect(raven.native?.recalled).toBe(true);
  expect(model.deployNativeHero('queen', 13, 21)).toBe(true);
  expect(owner.petId).not.toBe(raven.id);
});
