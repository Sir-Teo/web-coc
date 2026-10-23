import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { num, seconds } from '../../src/game/native-data';
import { spellRow } from '../../src/game/native-spells';

/** Real spell inputs leave a long-lived repair target inside a native Poison cloud. */
export function defendingBuilderPoisonRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 16, 20, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), earthquake: 1, poison: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), earthquake: 1, poison: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  const until = (ready: () => boolean) => {
    for (let remaining = 600; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Builder Poison checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeSpell = 'earthquake';
  if (!model.castSpell(14, 22)) throw Error('Earthquake cast failed');
  until(() => !!battle.late?.defendingBuilder?.builders[0]?.repairCount);
  const builder = battle.late!.defendingBuilder!.builders[0];
  model.activeSpell = 'poison';
  if (!model.castSpell(builder.x, builder.y)) throw Error('Poison cast failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Poison')!;
  const row = spellRow('Poison', cast.level);
  const end =
    cast.firstHit + (num(row, 'NumberOfHits') - 1) * cast.interval + seconds(row, 'BoostTimeMS');
  until(() => battle.elapsed >= cast.firstHit + 2);
  snapshot();
  const poisoned = battle.elapsed;
  until(() => battle.elapsed >= cast.firstHit + 6);
  snapshot();
  const later = battle.elapsed;
  until(() => battle.elapsed >= end + 3);
  snapshot();
  const recovered = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, poisoned, later, recovered };
}
