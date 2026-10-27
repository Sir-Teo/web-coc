import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { maxTroopLevel } from '../../src/game/data';
import type { GarrisonDefender } from '../../src/game/defenders';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { campaignResources } from '../../src/game/campaign-loot';
import { campaignStage } from '../../src/game/campaign-catalog';

export type AudioGarrisonKind = 'archer' | 'superminion' | 'electrodragon' | 'royalghost';

/** Real Castle release/attack inputs, or a Ghost Trap trigger followed by actual Lightning. */
export function garrisonAudioRecording(
  kind: AudioGarrisonKind = 'archer',
  version = REPLAY_VERSION,
) {
  const ghost = kind === 'royalghost',
    model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(ghost
      ? [
          { ...makeBuilding(2, 'bomb', 13, 10), npc: 'ghost-trap' as const },
          makeBuilding(3, 'goldstorage', 17, 10, 15),
        ]
      : [makeBuilding(2, 'clancastle', 13, 10, 9)]),
  ];
  model.state.army = { ...emptyArmy(), giant: 3 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: maxTroopLevel('giant') };
  model.state.spells = {
    ...emptySpells(),
    ...(ghost || kind === 'archer' ? { lightning: 1 } : {}),
  };
  model.state.spellLevels = { ...defaultSpellLevels(), lightning: 13 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  if (ghost) {
    data.initial.catalog = 'goblin-v1';
    data.initial.index = 75;
    data.initial.practice = false;
    data.initial.availableLoot = campaignResources(campaignStage(75, 'goblin-v1'));
    data.initial.lootRoom = { ...data.initial.availableLoot };
  } else
    data.initial.garrisons = [
      {
        castleId: 2,
        mode: 'guard',
        troops: [{ kind, level: kind === 'archer' ? 9 : kind === 'superminion' ? 9 : 3, count: 1 }],
      },
    ];
  const battle = (model.battle = replayBattle(data.initial, version)),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 25)
      throw Error(`Garrison audio ${kind} checkpoint missing`);
    model.step(0.05);
  };
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== battle.elapsed)
      snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeTroop = 'giant';
  if (!model.deploy(ghost ? 9 : 6.9, ghost ? 10.5 : 11.5))
    throw Error('Garrison audio deployment failed');
  if (!ghost && !model.deploy(6.9, 12.5)) throw Error('Garrison audio ally deployment failed');
  while (!battle.defenders?.some((d) => d.kind === kind)) step();
  const defender = battle.defenders!.find((d) => d.kind === kind)! as GarrisonDefender,
    defenderId = defender.id,
    spawned = snapshot();
  while (!defender.attacks.length) step();
  const launched = snapshot();
  while (defender.attacks[0].hitAt === undefined) step();
  const impact = snapshot();
  if (ghost || kind === 'archer') {
    step();
    model.activeSpell = 'lightning';
    if (!model.castSpell(defender.x, defender.y)) throw Error('Ghost Lightning failed');
  }
  while (battle.elapsed < impact + 0.45 - 1e-9) step();
  const later = snapshot();
  let dead: number | undefined;
  if (ghost || kind === 'archer') {
    while (defender.defeatedAt === undefined) step();
    step();
    dead = snapshot();
  }
  step();
  model.finishBattle();
  return {
    kind,
    defenderId,
    spawned,
    launched,
    impact,
    later,
    dead,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
