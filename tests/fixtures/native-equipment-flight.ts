import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A real released Dragon keeps moving while an equipment projectile homes toward it. */
export function nativeEquipmentFlightRecording(
  equipment: 'frost-charm' | 'seeking-shield',
  version = REPLAY_VERSION,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'clancastle', 15, 10, 8),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), iceblock: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'dragon', level: 5, count: 1 }] },
  ];
  recording.initial.heroes = [
    { kind: 'champion', level: 1, items: [{ slug: equipment, level: 1 }] },
  ];
  model.battle = replayBattle(recording.initial, version);
  if (!model.deployNativeHero('champion', 6.9, 11.5)) throw Error('Champion deployment failed');
  model.step(0.05);
  const hero = model.battle.units.find((unit) => unit.kind === 'royalchampion')!;
  model.activeSpell = 'iceblock';
  if (!model.castSpell(hero.x, hero.y)) throw Error('Ice Block failed');
  model.step(0.05);
  if (!model.activateNativeHeroAbility('champion')) throw Error('Equipment activation failed');
  const observation = equipment === 'frost-charm' ? 0.65 : 1.5;
  while (model.battle.elapsed < observation - 1e-9) model.step(0.05);
  const battle = JSON.parse(JSON.stringify(model.battle));
  const cast = (model.battle.nativeFrostFlakeCasts ?? model.battle.nativeSeekingShieldCasts)![0];
  const shot = cast.shots.find((shot) => shot.targetDefender)!;
  if (!shot) throw Error('Equipment did not select the released Dragon');
  while (model.battle.elapsed < 5 - 1e-9) model.step(0.05);
  const finalBattle = JSON.parse(JSON.stringify(model.battle));
  model.step(0.05);
  model.finishBattle();
  return {
    equipment,
    observation: battle.elapsed as number,
    battle,
    finalBattle,
    shotId: shot.id,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
