import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** The actual Clan Castle release attacks a Warden and Giant during Eternal Tome. */
export function garrisonTomeRecording(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'clancastle', 13, 10, 9),
  ];
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = emptySpells();
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'warden', level: 1, items: [{ slug: 'eternal-tome', level: 1 }] }];
  data.initial.garrisons = [
    { castleId: 2, mode: 'guard', troops: [{ kind: 'dragon', level: 7, count: 1 }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('warden', 6.9, 11.5)) throw Error('Tome Warden deployment failed');
  const unitId = battle.nativeHeroes![0].unitId!;
  model.activeHeroKind = null;
  model.activeHero = false;
  model.activeTroop = 'giant';
  if (!model.deploy(6.9, 12.5)) throw Error('Tome Giant deployment failed');
  const allyId = battle.units.at(-1)!.id;
  while (!battle.defenders?.some((defender) => defender.kind === 'dragon' && defender.attacking)) {
    if (battle.elapsed > 12) throw Error('Dragon did not begin its first wind-up');
    model.step(0.05);
  }
  const abilityAt = battle.elapsed;
  if (!model.activateNativeHeroAbility('warden')) throw Error('Eternal Tome activation failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const times = {
    primed: abilityAt + 0.1,
    engaged: abilityAt + 1.4,
    protected: abilityAt + 2.7,
    expired: abilityAt + 5.5,
  };
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    while (battle.elapsed < times[key] - 1e-9) {
      if (battle.finished) throw Error('Tome battle ended early');
      model.step(0.05);
    }
    times[key] = battle.elapsed;
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  model.step(0.05);
  model.finishBattle();
  return {
    unitId,
    allyId,
    abilityAt,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
