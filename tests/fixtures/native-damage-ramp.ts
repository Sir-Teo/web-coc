import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeUnitStats } from '../../src/game/native-units';

/** Real deployments, defender alert/Freeze inputs, staged hits, kill and fresh target. */
export function nativeDamageRampRecording(
  kind: 'infernodragon' | 'superminer',
  defenders: boolean,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(defenders
      ? []
      : [makeBuilding(2, 'goldstorage', 10, 5, 16), makeBuilding(3, 'goldstorage', 10, 8, 16)]),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = {
    ...emptyArmy(),
    swordsman: 1,
    [kind]: 1,
    ...(defenders ? { golem: 1 } : {}),
  };
  model.state.troopLevels = { ...model.state.troopLevels, [kind]: 1, golem: 14 };
  model.state.spells = { ...emptySpells(), freeze: defenders ? 1 : 0 };
  model.state.spellLevels = { ...defaultSpellLevels(), freeze: 7 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  if (defenders)
    data.initial.defendingHeroes = [
      { kind: 'king', level: 1, x: 9, y: 6.5 },
      { kind: 'queen', level: 1, x: 9, y: 7.5 },
    ];
  model.battle = replayBattle(data.initial);
  const battle = model.battle;
  const step = () => {
    if (battle.finished || battle.elapsed > 35)
      throw Error(`Ramp ${kind}/${defenders} checkpoint not reached`);
    model.step(0.05);
  };
  if (defenders) {
    model.activeTroop = 'golem';
    if (!model.deploy(14, 6.5)) throw Error('Ramp lure deployment failed');
    step();
    model.activeSpell = 'freeze';
    if (!model.castSpell(9, 6.5)) throw Error('Ramp Freeze failed');
    while (!(battle.defenders![0].stunnedUntil ?? 0)) step();
  }
  model.activeTroop = kind;
  if (!model.deploy(5, 6.5)) throw Error('Ramp troop deployment failed');
  const unit = battle.units.at(-1)!;
  const stats = nativeUnitStats(kind, 1);
  const hits: { at: number; id: number; damage: number; hp: number; startedAt: number }[] = [];
  const targets: { id: number; hp: number }[] = defenders ? battle.defenders! : battle.buildings;
  const hp = new Map(targets.map((t) => [t.id, t.hp] as const));
  model.onEffect = (fx) => {
    if (fx.sourceId === unit.id && fx.type === 'hit') {
      const target = targets.find((t) => t.id === fx.targetId);
      if (!target) throw Error('Ramp hit lost its target');
      hits.push({
        at: battle.elapsed,
        id: target.id,
        hp: target.hp,
        damage: hp.get(target.id)! - target.hp,
        startedAt: unit.native!.damageRamp!.startedAt,
      });
    }
    // The lure can also hit a defender: do not attribute that damage to the ramping troop.
    for (const target of targets) hp.set(target.id, target.hp);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (!hits.length) step();
  snapshot();
  const initial = battle.elapsed;
  const first = hits[0];
  while (!hits.some((h) => h.at - first.startedAt >= stats.damageRamp!.switchAt[0] - 1e-9)) step();
  snapshot();
  const middle = battle.elapsed;
  while (!hits.some((h) => h.at - first.startedAt >= stats.damageRamp!.switchAt[1] - 1e-9)) step();
  snapshot();
  const maximum = battle.elapsed;
  while (!hits.some((h) => h.id !== first.id)) step();
  snapshot();
  const retargeted = battle.elapsed;
  const kill = hits.find((h) => h.id === first.id && h.hp <= 0);
  if (!kill) throw Error('Ramp retarget did not follow a kill');
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    kind,
    defenders,
    unitId: unit.id,
    hits,
    snapshots,
    initial,
    middle,
    maximum,
    retargeted,
    killedAt: kill.at,
    firstTargetId: first.id,
    stats,
  };
}
