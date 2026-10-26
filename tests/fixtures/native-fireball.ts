import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function fireballBattle(level = 1, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 20, 10, 21),
    makeBuilding(3, 'elixirstorage', 24, 10, 16),
    makeBuilding(4, 'goldmine', 10, 10, 16),
    makeBuilding(5, 'wall', 20, 14, 18),
    makeBuilding(6, 'bomb', 21, 14, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1, invisibility: 1, overgrowth: 1, rage: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'warden', level: 40, items: [{ slug: 'fireball', level }] }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('warden', 6.9, 11.5))
    throw Error('Fireball Warden deployment failed');
  const wardenId = battle.nativeHeroes![0].unitId!;
  const until = (at: number) => {
    for (let remaining = 2000; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Fireball checkpoint was not reached');
      model.step(0.05);
    }
  };
  return { model, battle, data, wardenId, until };
}

/** Real activation, original flight, area hit and tail, all reconstructed from portable inputs. */
export function nativeFireballRecording(level = 1, version = REPLAY_VERSION, recall = false) {
  const r = fireballBattle(level, version);
  r.until(0.1);
  if (!r.model.activateNativeHeroAbility('warden')) throw Error('Fireball activation failed');
  const launched = r.battle.elapsed;
  if (recall) {
    r.model.activeSpell = 'recall';
    const unit = r.battle.units.find((u) => u.id === r.wardenId)!;
    if (!r.model.castSpell(unit.x, unit.y)) throw Error('Fireball Recall failed');
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const times = {
    launch: launched + 0.05,
    airborne: launched + 0.75,
    beforeHit: launched + 1.45,
    impact: launched + 1.5,
    explosion: launched + 1.75,
    tail: launched + 2.5,
    after: launched + 6,
  };
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    r.until(times[key]);
    times[key] = r.battle.elapsed;
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
  }
  r.model.step(0.05);
  r.model.finishBattle();
  return {
    name: 'Fireball' as const,
    level,
    ...times,
    launched,
    wardenId: r.wardenId,
    anchor: { x: 21.5, y: 11.5 },
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
