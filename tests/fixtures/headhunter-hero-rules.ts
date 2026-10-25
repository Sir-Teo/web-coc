import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

export function headhunterHeroBattle(level = 1, air = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 12, 10, 15),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), headhunter: 2, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, headhunter: level };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [];
  recording.initial.defendingHeroes = [
    { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 7.5, y: 5 },
  ];
  model.battle = replayBattle(recording.initial);
  return { model, battle: model.battle };
}

/** A real Headhunter deployment against a frozen defending Hero, before and after one shot. */
export function headhunterHeroRecording(air = false) {
  const { model, battle } = headhunterHeroBattle(1, air);
  const until = (at: number) => {
    for (let remaining = 200; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Headhunter checkpoint was not reached');
      model.step(0.05);
    }
  };
  model.activeSpell = 'freeze';
  if (!model.castSpell(7.5, 5)) throw Error('Headhunter Hero Freeze failed');
  until(1.6);
  model.activeTroop = 'headhunter';
  if (!model.deploy(5, 5)) throw Error('Headhunter deployment failed');
  const unitId = battle.units[0].id;
  const defenderId = battle.defenders!.find((d) => d.kind === 'hero')!.id;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(1.7);
  const shot = battle.projectiles!.find((shot) => shot.sourceId === unitId);
  if (!shot) throw Error('Headhunter did not fire at the frozen Hero');
  snapshot();
  const flight = battle.elapsed;
  until(shot.impact + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(hit + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    flight,
    hit,
    unitId,
    defenderId,
  };
}
