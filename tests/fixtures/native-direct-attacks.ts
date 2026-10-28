import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle, type Building } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { isGarrisonDefender } from '../../src/game/defenders';
import { superOriginal, superLevelOffset } from '../../src/game/special-troops';

export type NativeDirectKind =
  | 'icegolem'
  | 'rootrider'
  | 'electrotitan'
  | 'yeti'
  | 'superyeti'
  | 'superhogrider'
  | 'hogrider'
  | 'apprenticewarden'
  | 'headhunter'
  | 'thrower'
  | 'dragonrider'
  | 'rocketballoon'
  | 'babydragon'
  | 'superminion'
  | 'minion'
  | 'dragon'
  | 'balloon'
  | 'archer'
  | 'swordsman'
  | 'goblin'
  | 'wizard'
  | 'superbarbarian'
  | 'sneakygoblin'
  | 'superarcher'
  | 'superwizard'
  | 'superbowler'
  | 'superwallbreaker'
  | 'wallbreaker'
  | 'infernodragon'
  | 'superminer'
  | 'miner';
export type NativeDirectTarget =
  'storage' | 'cannon' | 'airdefense' | 'garrison' | 'air-garrison' | 'monolith';

interface NativeDirectOptions {
  buildingLevel?: number;
  extraBuildings?: Building[];
  spellLevels?: Partial<ReplayData['initial']['spells']>;
  beforeDeploy?: (ctx: { model: GameModel; battle: Battle; step: () => void }) => void;
}

export function nativeDirectBattle(
  kind: NativeDirectKind,
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  target: NativeDirectTarget = 'storage',
  spells: Partial<ReplayData['initial']['spells']> = {},
  options: NativeDirectOptions = {},
) {
  const garrison = target === 'garrison' || target === 'air-garrison';
  const yeti = kind === 'yeti' || kind === 'superyeti';
  const original = superOriginal(kind);
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(
      2,
      garrison
        ? 'clancastle'
        : target === 'cannon'
          ? 'cannon'
          : target === 'airdefense'
            ? 'airdefense'
            : target === 'monolith'
              ? 'monolith'
              : 'goldstorage',
      13,
      10,
      options.buildingLevel ??
        (garrison
          ? 9
          : target === 'monolith'
            ? 1
            : target === 'airdefense'
              ? 13
              : target === 'cannon'
                ? kind === 'electrotitan' ||
                  kind === 'rocketballoon' ||
                  kind === 'balloon' ||
                  kind === 'babydragon' ||
                  yeti
                  ? 21
                  : 6
                : 18),
    ),
    ...(options.extraBuildings ?? []),
  ];
  model.state.army = {
    ...emptyArmy(),
    [kind]: 1,
    archer: kind === 'archer' ? 3 : kind === 'superhogrider' ? 0 : 2,
  };
  model.state.troopLevels = {
    ...model.state.troopLevels,
    ...(original ? { [original]: level + superLevelOffset(kind) } : {}),
    [kind]: level,
  };
  model.state.spells = { ...emptySpells(), ...(yeti ? { recall: 1 } : {}), ...spells };
  if (options.spellLevels)
    model.state.spellLevels = {
      ...defaultSpellLevels(),
      ...model.state.spellLevels,
      ...options.spellLevels,
    };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  data.initial.catalog = 'goblin-v1';
  data.initial.practice = false;
  data.initial.availableLoot = campaignResources(campaignStage(0, 'goblin-v1'));
  data.initial.lootRoom = { ...data.initial.availableLoot };
  if (garrison)
    data.initial.garrisons = [
      {
        castleId: 2,
        mode: 'guard',
        troops: [
          {
            kind: target === 'air-garrison' ? 'dragon' : 'golem',
            level: target === 'air-garrison' ? 7 : 8,
            count: 1,
          },
        ],
      },
    ];
  const battle = (model.battle = replayBattle(data.initial, version));
  const step = () => {
    if (battle.finished || battle.elapsed > 35)
      throw Error('Native direct attack checkpoint missing');
    model.step(0.05);
  };
  model.activeHero = false;
  model.activeHeroKind = null;
  if (garrison) {
    // An actual Archer lures the reserve before the primary unit commits to a building.
    model.activeTroop = 'archer';
    if (!model.deploy(5, 11.5)) throw Error('Native direct attack lure deployment failed');
    const lure = battle.units[0];
    while (lure.hp > 0 || !battle.defenders?.some(isGarrisonDefender)) step();
  }
  options.beforeDeploy?.({ model, battle, step });
  model.activeTroop = kind;
  if (!model.deploy(x, 11.5)) throw Error('Native direct attack deployment failed');
  const unit = battle.units.filter((u) => u.kind === kind).at(-1)!;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((unit.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, unit, data, step, until, untilAttacks };
}

/** Actual defense fire or an Archer-lured Castle reserve; no injected damage or status state. */
export function nativeDirectRecording(
  kind: NativeDirectKind,
  timingVersion: number,
  version = REPLAY_VERSION,
  level = 1,
  garrison: boolean | 'air' = false,
  chargeCheckpointSeconds = 0.7,
  buildingTarget: 'cannon' | 'airdefense' | 'storage' = 'cannon',
  deployX = 11.4,
) {
  const r = nativeDirectBattle(
      kind,
      level,
      version,
      garrison ? 6.9 : deployX,
      garrison === 'air' ? 'air-garrison' : garrison ? 'garrison' : buildingTarget,
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
  if (version >= timingVersion) {
    r.until(engaged + chargeCheckpointSeconds);
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
  if (version >= timingVersion) r.untilAttacks(2);
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
