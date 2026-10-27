import { emptyArmy, emptySpells } from '../../src/game/army';
import { campaignStage } from '../../src/game/campaign-catalog';
import { campaignResources } from '../../src/game/campaign-loot';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function attackingWitchBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 11.4,
  superTroop = false,
  garrison: false | 'ground' | 'air' = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, garrison ? 'clancastle' : 'goldstorage', 13, 10, garrison ? 9 : 18),
  ];
  model.state.army = {
    ...emptyArmy(),
    witch: superTroop ? 0 : 1,
    superwitch: superTroop ? 1 : 0,
    archer: 1,
  };
  model.state.troopLevels = { ...model.state.troopLevels, witch: level, superwitch: level };
  model.state.spells = emptySpells();
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
            kind: garrison === 'air' ? 'dragon' : 'golem',
            level: garrison === 'air' ? 7 : 8,
            count: 1,
          },
        ],
      },
    ];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = superTroop ? 'superwitch' : 'witch';
  if (!model.deploy(x, 11.5)) throw Error('Witch fixture deployment failed');
  const shots: { at: number; shot: NonNullable<Battle['projectiles']>[number] }[] = [],
    seen = new Set<string>();
  let defenderRelease: { at: number; battle: Battle; shotId: string } | undefined;
  const step = () => {
    if (battle.finished || battle.elapsed > 35) throw Error('Witch checkpoint missing');
    model.step(0.05);
    for (const shot of battle.projectiles ?? [])
      if (shot.sourceId === battle.units[0].id && !seen.has(shot.id)) {
        seen.add(shot.id);
        shots.push({ at: shot.launched, shot: structuredClone(shot) });
        if (shot.targetDefender && !defenderRelease)
          defenderRelease = {
            at: battle.elapsed,
            battle: JSON.parse(JSON.stringify(battle)),
            shotId: shot.id,
          };
      }
  };
  const unit = battle.units[0];
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (n: number) => {
    while (shots.length < n) step();
  };
  return {
    model,
    battle,
    unit,
    data,
    step,
    until,
    untilAttacks,
    shots,
    get defenderRelease() {
      return defenderRelease;
    },
  };
}
/** Ordinary deployment with optional real Castle release; no injected combat/status state. */
export function attackingWitchRecording(
  version = REPLAY_VERSION,
  x = 11.4,
  level = 1,
  superTroop = false,
  garrison: false | 'ground' | 'air' = false,
) {
  const r = attackingWitchBattle(level, version, x, superTroop, garrison),
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
  if (version >= 166) {
    r.until(engaged + 0.3);
    charged = snapshot();
  }
  r.untilAttacks(1);
  const first = snapshot();
  r.untilAttacks(2);
  const second = snapshot(),
    shotId = r.shots[0].shot.id;
  let defenderReleased: number | undefined, defenderShotId: string | undefined;
  if (garrison) {
    while (!r.defenderRelease) r.step();
    const release = r.defenderRelease!;
    defenderShotId = release.shotId;
    defenderReleased = release.at;
    if (!snapshots.some((s) => s.at === release.at))
      snapshots.push({ at: release.at, battle: release.battle });
  }
  while (r.battle.projectiles?.some((p) => p.id === shotId)) r.step();
  const landed = snapshot();
  r.step();
  r.model.finishBattle();
  snapshots.sort((a, b) => a.at - b.at);
  return {
    id: r.unit.id,
    born,
    engaged,
    charged,
    first,
    second,
    landed,
    shotId,
    defenderReleased,
    defenderShotId,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
