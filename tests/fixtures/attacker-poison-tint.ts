import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Real Headhunter hits, followed by Lightning to stop refreshes, leave a timed Poison cue. */
export function attackerPoisonTintRecording(hero: boolean) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 20, 20, 8),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.spells = { ...emptySpells(), lightning: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), lightning: 11 };
  model.state.king = hero ? { level: 60 } : undefined;
  model.state.heroLineup = hero ? ['king'] : [];
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'headhunter', level: 3, count: 1 }] },
  ];
  recording.initial.defendingHeroes = [];
  recording.initial.heroes = hero ? [{ kind: 'king', level: 60, items: [] }] : [];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const until = (ready: () => boolean) => {
    for (let remaining = 600; !ready(); remaining--) {
      if (!remaining || battle.finished) throw Error('Attacker Poison checkpoint not reached');
      model.step(0.05);
    }
  };
  model.activeTroop = 'giant';
  if (!(hero ? model.deployHero(10, 21) : model.deploy(10, 21)))
    throw Error('Attacker deployment failed');
  const unit = battle.units[0];
  until(() => !!unit.late?.garrison?.poison);
  const poisoned = battle.elapsed;
  const defender = battle.defenders!.find((d) => d.kind === 'headhunter')!;
  model.activeSpell = 'lightning';
  if (!model.castSpell(defender.x, defender.y)) throw Error('Lightning cast failed');
  until(() => defender.hp <= 0);
  until(() => !unit.late?.garrison?.poison);
  for (let i = 0; i < 3; i++) model.step(0.05);
  const expired = battle.elapsed;
  for (let i = 0; i < 10; i++) model.step(0.05);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    poisoned,
    expired,
    unitId: unit.id,
  };
}
