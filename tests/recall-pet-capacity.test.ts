import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../src/game/replay';

it.each([
  [REPLAY_VERSION, 'lassi', ['king', 'queen']],
  [REPLAY_VERSION, null, ['king', 'queen', 'warden']],
  [REPLAY_VERSION, 'jelly', ['king', 'queen', 'warden']],
  [297, 'lassi', ['king', 'queen', 'warden']],
] as const)('recall capacity in version %s with pet=%s', (version, pet, recalled) => {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'king', level: 1, items: [], ...(pet ? { pet: { kind: pet, level: 1 } } : {}) },
    { kind: 'queen', level: 1, items: [] },
    { kind: 'warden', level: 1, items: [] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  for (const kind of ['king', 'queen', 'warden'] as const)
    expect(model.deployNativeHero(kind, 5, 6.5)).toBe(true);
  model.activeSpell = 'recall';
  expect(model.castSpell(5, 6.5)).toBe(true);
  while (battle.elapsed < 2) model.step(0.05);
  expect(
    battle.nativeHeroes?.filter((hero) => hero.unitId === null).map((hero) => hero.kind),
  ).toEqual(recalled);
  expect(model.deployNativeHero('king', 5, 6.5)).toBe(true);
  expect(!!battle.nativeHeroes?.[0].petId).toBe(!!pet);
  model.step(0.05);
  model.finishBattle();
  const playback = new GameModel();
  expect(playback.openReplay(data)).toBe(true);
  playback.seekReplay(battle.elapsed);
  while (playback.replay?.seeking) playback.step(0.05);
  expect(playback.battle?.nativeHeroes).toEqual(battle.nativeHeroes);
});
