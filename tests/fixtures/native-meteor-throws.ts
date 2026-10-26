import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Real deployed/Clone-created Golems throw at a defending Queen; no injected damage or spawned units. */
export function nativeMeteorThrowRecording(level = 1, cloned = false) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), meteorgolem: 1, giant: 1 };
  model.state.spells = { ...emptySpells(), ...(cloned ? { clone: 1 } : {}) };
  model.state.troopLevels = { ...model.state.troopLevels, meteorgolem: level };
  model.state.spellLevels = { ...model.state.spellLevels, clone: 9 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  data.initial.defendingHeroes = [{ kind: 'queen', level: 100, x: cloned ? 26 : 9, y: 6.5 }];
  const battle = (model.battle = replayBattle(data.initial));
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 25)
      throw Error(`Meteor throw checkpoint missing at ${battle.elapsed}`);
    model.step(0.05);
  };
  if (cloned) {
    model.activeSpell = 'clone';
    if (!model.castSpell(13, 6.5)) throw Error('Clone input failed');
  }
  model.activeTroop = 'meteorgolem';
  if (!model.deploy(cloned ? 13 : 15, 6.5)) throw Error('Meteor Golem deployment failed');
  let actor;
  if (cloned) {
    while (
      !(actor = battle.units.find(
        (u) => u.kind === 'meteorgolem' && u.native?.cloneUntil !== undefined,
      ))
    )
      step();
  } else {
    step();
    actor = battle.units.find((u) => u.kind === 'meteorgolem')!;
  }
  if (!actor || actor.kind !== 'meteorgolem')
    throw Error('Original Golem body missing before throw');
  const sourceId = actor.id,
    body = battle.elapsed,
    cloneUntil = actor.native?.cloneUntil;
  snapshots.push(snapshot());
  let before = snapshot(),
    shot;
  while (
    !(shot = battle.projectiles?.find(
      (p) => p.sourceId === sourceId && p.targetDefender && p.native?.kind === 'meteorgolem',
    ))
  ) {
    before = snapshot();
    step();
  }
  if (actor.kind !== 'meteormite') throw Error('Defender throw did not split the staying half');
  const stayingHP = actor.hp,
    pending = battle.nativePendingSpawns?.find(
      (s) => s.kind === 'meteormite' && Math.abs(s.at - shot.impact) < 1e-9,
    );
  if (!pending || pending.level !== level || pending.hp !== stayingHP)
    throw Error('Thrown half did not retain captured tier/health');
  if (cloned && (actor.native?.cloneUntil !== cloneUntil || pending.cloneUntil !== cloneUntil))
    throw Error('Split clone lost its deadline');
  snapshots.push(before, snapshot());
  const flight = battle.elapsed;
  step();
  const visible = battle.elapsed;
  snapshots.push(snapshot());
  while (battle.elapsed < shot.impact) step();
  const landed = battle.elapsed;
  snapshots.push(snapshot());
  const child = battle.units.find(
    (u) =>
      u.id !== sourceId &&
      u.kind === 'meteormite' &&
      u.spawnedAt === shot.impact &&
      u.level === level &&
      u.x === pending.x &&
      u.y === pending.y,
  );
  if (!child) throw Error('Thrown half missing at its packet impact');
  if (cloned && child.native?.cloneUntil !== cloneUntil)
    throw Error('Landed clone refreshed its lifetime');
  step();
  model.finishBattle();
  return {
    level,
    cloned,
    sourceId,
    childId: child.id,
    body,
    before: before.at,
    flight,
    visible,
    landed,
    impact: shot.impact,
    launched: shot.launched,
    shotId: shot.id,
    targetId: shot.targetId,
    cloneUntil,
    stayingHP,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
