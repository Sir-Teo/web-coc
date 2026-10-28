import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { isGarrisonDefender } from '../../src/game/defenders';

export function attackingIceGolemBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: 'storage' | 'cannon' | 'garrison' = 'storage',
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(
      2,
      target === 'garrison' ? 'clancastle' : target === 'cannon' ? 'cannon' : 'goldstorage',
      13,
      10,
      target === 'garrison' ? 9 : target === 'cannon' ? 6 : 18,
    ),
  ];
  model.state.army = { ...emptyArmy(), icegolem: 1, archer: 2 };
  model.state.troopLevels = { ...model.state.troopLevels, icegolem: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  if (target === 'garrison')
    data.initial.garrisons = [
      { castleId: 2, mode: 'guard', troops: [{ kind: 'golem', level: 8, count: 1 }] },
    ];
  const battle = (model.battle = replayBattle(data.initial, version));
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Ice Golem checkpoint missing');
    model.step(0.05);
  };
  model.activeHero = false;
  model.activeHeroKind = null;
  if (target === 'garrison') {
    // An actual Archer lures the reserve before the defense-preferring Golem commits a building.
    model.activeTroop = 'archer';
    if (!model.deploy(5, 11.5)) throw Error('Ice Golem lure deployment failed');
    const lure = battle.units[0];
    while (lure.hp > 0 || !battle.defenders?.some(isGarrisonDefender)) step();
  }
  model.activeTroop = 'icegolem';
  if (!model.deploy(x, 11.5)) throw Error('Ice Golem deployment failed');
  const unit = battle.units.find((u) => u.kind === 'icegolem')!;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}

/** Actual Cannon fire or an Archer-lured Castle reserve; no injected damage or status state. */
export function attackingIceGolemRecording(version = REPLAY_VERSION, level = 1, garrison = false) {
  const r = attackingIceGolemBattle(
      level,
      version,
      garrison ? 6.9 : 11.4,
      garrison ? 'garrison' : 'cannon',
    ),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 172) {
    r.until(engaged + 0.7);
    charged = snapshot();
    r.untilAttacks(1);
  }
  const first = snapshot(),
    target = garrison
      ? r.battle.defenders!.find((d) => d.id === r.unit.defenderTarget)!
      : r.battle.buildings.find((b) => b.id === 2)!,
    hp = target.hp;
  r.until(first + 0.2);
  const recovery = snapshot();
  if (version >= 172) r.untilAttacks(2);
  else while (target.hp === hp) r.step();
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    defenderId: garrison ? target.id : undefined,
    born,
    engaged,
    charged,
    first,
    recovery,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
