import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeUnitStats } from '../../src/game/native-units';
import { unitAttackIntervalScale } from '../../src/game/native-status';

/** Frosty fires while slowed by a real defensive Poison Spell Tower. */
export function petAnimationRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    { ...makeBuilding(2, 'spelltower', 15, 15, 3), spellMode: 'poison' as const },
    { ...makeBuilding(3, 'spelltower', 22, 15, 3), spellMode: 'poison' as const },
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [
    { kind: 'king', level: 50, items: [], pet: { kind: 'frosty', level: 15 } },
  ];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  if (!model.deployNativeHero('king', 20, 21)) throw Error('Pet animation owner deployment failed');
  const pet = battle.units.find((u) => u.kind === 'frostypet')!;
  const base = nativeUnitStats(pet.kind, pet.level).rate;
  let launched: number | undefined;
  let interval = 0;
  model.onEffect = (effect) => {
    if (effect.type !== 'projectile' || effect.sourceId !== pet.id || launched !== undefined)
      return;
    const poison = pet.native?.effects?.poison;
    if (!poison || poison.until <= battle.elapsed) return;
    interval = base * unitAttackIntervalScale(pet, battle.elapsed);
    if (interval <= base) return;
    launched = battle.elapsed;
  };
  const step = () => {
    if (battle.elapsed > 20 || battle.finished || pet.hp <= 0)
      throw Error('Poisoned pet did not reach its animation checkpoint');
    model.step(0.05);
  };
  while (launched === undefined) step();
  const snapshots: { at: number; battle: unknown }[] = [];
  for (const age of [0.15, 0.3]) {
    while (battle.elapsed < launched + age - 1e-9) step();
    if (!pet.attacking) throw Error('Poisoned pet left its target before the animation checkpoint');
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    petId: pet.id,
    launched,
    base,
    interval,
  };
}
