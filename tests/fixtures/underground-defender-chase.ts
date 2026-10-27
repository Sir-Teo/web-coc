import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

export function undergroundChaseRecording(kind: 'miner' | 'diggy') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
  ];
  model.state.nextId = 1000;
  model.state.army = {
    ...emptyArmy(),
    giant: 1,
    goblin: 1,
    ...(kind === 'miner' ? { miner: 1 } : {}),
  };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes =
    kind === 'diggy'
      ? [{ kind: 'queen', level: 1, items: [], pet: { kind: 'diggy', level: 1 } }]
      : [];
  recording.initial.defendingHeroes = [{ kind: 'king', level: 110, x: 9, y: 6.5 }];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  const step = () => {
    if (battle.elapsed > 12 || battle.finished)
      throw Error('Underground defender checkpoint was not reached');
    model.step(0.05);
  };
  model.activeTroop = 'goblin';
  if (!model.deploy(14, 6.5)) throw Error('Underground alert deployment failed');
  step();
  model.activeSpell = 'freeze';
  if (!model.castSpell(enemy.x, enemy.y)) throw Error('Underground enemy Freeze failed');
  while ((enemy.stunnedUntil ?? 0) <= battle.elapsed) step();
  let subjectId: number;
  if (kind === 'diggy') {
    if (!model.deployNativeHero('queen', 5, 6.5)) throw Error('Diggy owner deployment failed');
    subjectId = battle.nativeHeroes![0].petId!;
  } else {
    model.activeTroop = 'miner';
    if (!model.deploy(5, 6.5)) throw Error('Miner deployment failed');
    subjectId = battle.units.at(-1)!.id;
  }
  const unit = battle.units.find((u) => u.id === subjectId)!;
  const hits: { at: number; surfaced: boolean; burrowed: boolean }[] = [];
  let retaliated = false;
  model.onEffect = (effect) => {
    if (effect.type !== 'hit') return;
    if (effect.sourceId === subjectId && effect.targetDefender)
      hits.push({
        at: battle.elapsed,
        surfaced: !!unit.native?.surfaced,
        burrowed: !!unit.native?.burrowed,
      });
    if (effect.sourceId === enemy.id && unit.hp < unit.maxHp) retaliated = true;
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const moving = battle.elapsed;
  while (!hits.length) step();
  snapshot();
  const surfaced = battle.elapsed;
  while (!retaliated) step();
  snapshot();
  const hit = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    hits,
    subjectId,
    enemyId: enemy.id,
    moving,
    surfaced,
    hit,
  };
}
