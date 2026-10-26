import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Source healing flights after real Cannon wounds, with portable input-only replay. */
export function nativeHealingRecording(kind: 'unicorn' | 'druid') {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 10, kind === 'druid' ? 3 : 4, kind === 'druid' ? 1 : 21),
    makeBuilding(3, 'cannon', 10, kind === 'druid' ? 8 : 9, kind === 'druid' ? 1 : 21),
  ];
  model.state.army = { ...emptyArmy(), giant: 3, druid: kind === 'druid' ? 1 : 0 };
  model.state.troopLevels = { ...model.state.troopLevels, giant: kind === 'druid' ? 14 : 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes =
    kind === 'unicorn'
      ? [{ kind: 'king', level: 30, items: [], pet: { kind: 'unicorn', level: 1 } }]
      : [];
  const battle = (model.battle = replayBattle(data.initial));
  model.activeTroop = 'giant';
  if (!model.deploy(5, kind === 'druid' ? 8 : 10)) throw Error('Healing ally deployment failed');
  if (kind === 'unicorn') {
    if (!model.deployNativeHero('king', 5, 5)) throw Error('Healing Hero deployment failed');
  } else {
    if (!model.deploy(5, 5)) throw Error('Healing second ally deployment failed');
    model.activeTroop = 'druid';
    if (!model.deploy(2, 6.5)) throw Error('Druid deployment failed');
  }
  const caster = battle.units.find((u) => u.kind === kind)!;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 18)
      throw Error(`${kind} healing checkpoint not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  let shot;
  for (;;) {
    step();
    shot = battle.projectiles?.find(
      (p) =>
        p.native?.healing &&
        p.sourceId === caster.id &&
        !p.native.bounce &&
        p.impact > battle.elapsed + 0.05 &&
        battle.units.some((u) => u.id === p.targetId && u.hp < u.maxHp),
    );
    if (shot) break;
  }
  const target = battle.units.find((u) => u.id === shot.targetId)!;
  const inFlight = battle.elapsed,
    beforeHp = target.hp;
  snapshot();
  while (battle.elapsed < shot.impact) step();
  const landed = battle.elapsed;
  if (target.hp <= beforeHp)
    throw Error(`${kind} recovery missing after arrival: ${beforeHp} -> ${target.hp}`);
  snapshot();
  const hop = battle.projectiles?.find((p) => p.native?.healing && p.native.bounce === 1);
  if (kind === 'druid' && !hop) throw Error('Druid did not bounce to the other wounded ally');
  if (hop) {
    while (battle.elapsed < hop.impact) step();
    snapshot();
  }
  step();
  model.finishBattle();
  return {
    kind,
    casterId: caster.id,
    targetId: target.id,
    inFlight,
    landed,
    shotId: shot.id,
    hopId: hop?.id,
    beforeHp,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
