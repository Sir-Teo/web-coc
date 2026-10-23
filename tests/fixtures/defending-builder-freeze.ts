import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { seconds } from '../../src/game/native-data';
import { spellRow } from '../../src/game/native-spells';

/** Recorded spell inputs damage a real repair target, freeze its worker and let him resume. */
export function defendingBuilderFreezeRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
    makeBuilding(3, 'cannon', 23, 20, 21),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), earthquake: 1, freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), earthquake: 1, freeze: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  let step = 0;
  const advance = () => {
    model.step(0.05);
    step++;
  };
  const until = (ready: () => boolean) => {
    for (let remaining = 400; !ready(); remaining--) {
      if (!remaining || battle.finished)
        throw Error('Builder Freeze fixture did not reach its checkpoint');
      advance();
    }
  };
  const snapshots: { step: number; at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ step, at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  model.activeSpell = 'earthquake';
  if (!model.castSpell(26.5, 21.5)) throw Error('Earthquake cast failed');
  until(() => !!battle.late?.defendingBuilder?.builders[0]?.repairCount);
  const builder = battle.late!.defendingBuilder!.builders[0];
  model.activeSpell = 'freeze';
  if (!model.castSpell(builder.x, builder.y)) throw Error('Freeze cast failed');
  snapshot();
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Freeze')!;
  const freezeEnd = cast.firstHit + seconds(spellRow('Freeze', cast.level), 'FreezeTimeMS');
  until(() => battle.elapsed >= cast.firstHit + 0.1);
  snapshot();
  const firstFrozen = battle.elapsed;
  until(() => battle.elapsed >= cast.firstHit + 1.5);
  snapshot();
  const laterFrozen = battle.elapsed;
  until(() => battle.elapsed >= freezeEnd + 1);
  snapshot();
  for (let i = 0; i < 10; i++) advance();
  model.finishBattle();
  const data = JSON.parse(JSON.stringify(model.state.raidLog![0].replay!));
  return { data, snapshots, firstFrozen, laterFrozen, freezeEnd, builderId: builder.id };
}
