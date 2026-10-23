import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';

/** Only recorded spell inputs damage the two candidates and reset the worker's commitment. */
export function defendingBuilderLightningRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 16, 20, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
    makeBuilding(3, 'goldmine', 20, 22, 4),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), earthquake: 1, lightning: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), earthquake: 1, lightning: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const until = (ready: () => boolean) => {
    for (let remaining = 400; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Builder Lightning checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeSpell = 'earthquake';
  if (!model.castSpell(14, 22)) throw Error('Earthquake cast failed');
  until(() => !!battle.late?.defendingBuilder?.builders[0]?.repairCount);
  const builder = battle.late!.defendingBuilder!.builders[0];
  if (builder.target !== 1 || battle.buildings[2].hp !== battle.buildings[2].maxHp)
    throw Error('Earthquake must damage only the initial repair candidate');
  model.activeSpell = 'lightning';
  if (!model.castSpell(builder.x, builder.y)) throw Error('Lightning cast failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Lightning')!;
  until(() => battle.elapsed >= cast.firstHit + 0.2);
  snapshot();
  const after = battle.elapsed;
  until(() => battle.elapsed >= after + 2);
  snapshot();
  const repaired = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, before, after, repaired };
}
