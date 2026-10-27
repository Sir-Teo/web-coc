import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export type AuraEquipment = 'electro-boots' | 'rage-gem' | 'life-gem';
export type AuraRevival = 'revive' | 'phoenix';
/** Real Monolith fire, a spent manual ability and recorded resurrection inputs. */
export function heroAuraRevivalRecording(
  equipment: AuraEquipment,
  revival: AuraRevival,
  version = REPLAY_VERSION,
) {
  const kind = equipment === 'electro-boots' ? 'champion' : 'warden';
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'monolith', 13, 10, 1),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), revive: 1, freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), freeze: 8 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [
    {
      kind,
      level: 1,
      items: [{ slug: equipment, level: 1 }],
      ...(revival === 'phoenix' ? { pet: { kind: 'phoenix' as const, level: 1 } } : {}),
    },
  ];
  const battle = (model.battle = replayBattle(recording.initial, version));
  if (!model.deployNativeHero(kind, 6.9, 11.5)) throw Error('Aura Hero deployment failed');
  if (!model.activateNativeHeroAbility(kind)) throw Error('Aura initial ability input failed');
  const hero = battle.nativeHeroes![0],
    unitId = hero.unitId!,
    unit = battle.units.find((u) => u.id === unitId)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 60) throw Error('Aura revival checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  step();
  const deployed = snapshot();
  while (unit.hp > 0) step();
  const knocked = battle.elapsed;
  let resurrectAt: number;
  if (revival === 'phoenix') {
    const shot = battle.projectiles!.find((p) => p.native?.phoenixRevive)!;
    if (!shot) throw Error('Phoenix did not launch its resurrection');
    resurrectAt = shot.impact;
    until(resurrectAt - 0.05);
  } else {
    model.activeSpell = 'freeze';
    if (!model.castSpell(14.5, 11.5)) throw Error('Aura Monolith Freeze failed');
    until(knocked + 0.6);
  }
  const dead = snapshot();
  if (revival === 'revive') {
    step();
    if (!model.castReviveOnHero(kind)) throw Error('Aura Revive failed');
    resurrectAt = battle.nativeSpells!.find((c) => c.name === 'Revive')!.firstHit;
  }
  until(resurrectAt! + 0.1);
  const restored = snapshot();
  step();
  model.activeSpell = null;
  model.activeHeroKind = null;
  model.activeHero = false;
  model.activeTroop = 'giant';
  if (!model.deploy(5.5, 11.5)) throw Error('Aura ally deployment failed');
  const allyId = battle.units.at(-1)!.id;
  until(resurrectAt! + 1.2);
  const later = snapshot();
  step();
  model.finishBattle();
  return {
    equipment,
    revival,
    kind,
    unitId,
    allyId,
    deployed,
    knocked,
    dead,
    resurrectAt: resurrectAt!,
    restored,
    later,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
