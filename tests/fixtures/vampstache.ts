import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';

export function vampstacheBattle(level = 18, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [{ kind: 'king', level: 100, items: [{ slug: 'vampstache', level }] }];
  recording.initial.defendingHeroes = [{ kind: 'king', level: 110, x: 5.8, y: 5 }];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('king', 5, 5)) throw Error('Vampstache King deployment failed');
  const battle = model.battle;
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, hero, unit };
}

/** A real King duel records the HP immediately before and after every healing swing. */
export function vampstacheRecording(level = 18) {
  const { model, battle, unit } = vampstacheBattle(level);
  const strikes: { at: number; before: number; after?: number }[] = [];
  model.onEffect = (effect) => {
    if (effect.type === 'hit' && effect.sourceId === unit.id)
      strikes.push({ at: battle.elapsed, before: unit.hp });
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  for (let tick = 1; tick <= 100; tick++) {
    if (battle.finished || unit.hp <= 0) throw Error('Vampstache duel ended early');
    model.step(0.05);
    for (const hit of strikes) if (hit.after === undefined) hit.after = unit.hp;
    if ([1, 40, 100].includes(tick))
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  const final = battle.elapsed;
  model.onEffect = () => {};
  model.step(0.05);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    strikes,
    final,
    unitId: unit.id,
    heal: level === 1 ? 60 : 300,
  };
}
