import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function revengeDeckBattle(
  level = 1,
  version = REPLAY_VERSION,
  hold = true,
  armed = false,
  recovery: 'spells' | 'phoenix' | undefined = undefined,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'archertower', armed ? 13 : 20, 10, armed ? 21 : 1),
    makeBuilding(3, 'archertower', armed ? 13 : 20, 16, armed ? 21 : 1),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = {
    ...emptySpells(),
    ...(recovery === 'spells' ? { recall: 1, revive: 1 } : {}),
  };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    {
      kind: 'duke',
      level: 1,
      items: [{ slug: 'draconic-counter', level }],
      ...(recovery === 'phoenix' ? { pet: { kind: 'phoenix' as const, level: 1 } } : {}),
    },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('duke', 6.9, 11.5))
    throw Error('Revenge Deck Duke deployment failed');
  const hero = battle.nativeHeroes![0],
    unit = battle.units.find((unit) => unit.id === hero.unitId)!;
  if (hold) unit.native!.effects = { frozenUntil: 100 };
  const until = (at: number) => {
    while (model.battle!.elapsed < at - 1e-9) {
      if (model.battle!.finished) throw Error('Revenge Deck checkpoint missing');
      model.step(0.05);
    }
  };
  const cards = () =>
    (model.battle!.projectiles ?? []).filter(
      (shot) => shot.native?.name === 'ddreversalcardprojectile',
    );
  return { model, battle, data, hero, unit, until, cards };
}
