import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { spawnNativeUnit, type NativeTroopContext } from '../../src/game/native-troops';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** The optional child is an isolated native spawn; portable fixtures use actual parent death. */
export function attackingGolemBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  child = false,
  defense: boolean | 'monolith' = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, defense ? 18 : 1),
    makeBuilding(
      2,
      defense === 'monolith' ? 'monolith' : defense ? 'cannon' : 'goldstorage',
      13,
      10,
      defense === 'monolith' ? 1 : defense ? 21 : 18,
    ),
  ];
  model.state.army = { ...emptyArmy(), golem: 1, archer: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, golem: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'golem';
  if (!model.deploy(x, 11.5)) throw Error('Golem deployment failed');
  let unit = battle.units[0];
  if (child) {
    battle.units = [];
    const ctx: NativeTroopContext = {
      battle,
      buildings: battle.buildings,
      buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
      passableWalls: new Set(),
      nextId: () => model.state.nextId++,
      troopLevel: () => level,
      damageBuilding: (b, amount) => model.damage(b, amount),
      effect: () => {},
    };
    unit = spawnNativeUnit(ctx, 'golemite', level, x, 11.5, 0);
  }
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Golem checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}

/** Ordinary deployment against a live original Cannon; no injected combat/status state. */
export function attackingGolemRecording(version = REPLAY_VERSION, x = 11.4, level = 1) {
  const r = attackingGolemBattle(level, version, x, false, true),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 162) {
    r.until(engaged + 0.7);
    charged = snapshot();
  }
  r.untilAttacks(1);
  const first = snapshot();
  r.until(first + 0.4);
  const recovery = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.untilAttacks(3);
  const third = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    engaged,
    charged,
    first,
    recovery,
    second,
    third,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** An actual Monolith defeat releases native Golemites; no manual death/spawn input. */
export function attackingGolemiteRecording(version = REPLAY_VERSION) {
  const r = attackingGolemBattle(1, version, 11.4, false, 'monolith'),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (!r.battle.units.some((u) => u.kind === 'golemite')) r.step();
  const unit = r.battle.units.find((u) => u.kind === 'golemite')!,
    born = snapshot();
  while (!unit.attacking) r.step();
  const engaged = snapshot();
  let charged: number | undefined;
  if (version >= 162) {
    r.until(engaged + 0.7);
    charged = snapshot();
  }
  while ((unit.native?.attacks ?? 0) < 1) r.step();
  const first = snapshot();
  r.until(first + 0.15);
  const tail = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: unit.id,
    parentId: r.unit.id,
    born,
    engaged,
    charged,
    first,
    tail,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
