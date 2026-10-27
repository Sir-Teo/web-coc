import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export const SNAKE_DAMAGE_KEY = 'damage:BarbarianKingSpawnOnTakeDamage';

export function snakeBraceletBattle(
  level = 1,
  version = REPLAY_VERSION,
  armed = false,
  kingLevel = 95,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(armed ? [makeBuilding(2, 'cannon', 13, 10, 21)] : []),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 2 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [
    { kind: 'king', level: kingLevel, items: [{ slug: 'snake-bracelet', level }] },
  ];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', 6.9, 11.5))
    throw Error('Snake Bracelet King deployment failed');
  const hero = battle.nativeHeroes![0],
    unit = battle.units.find((unit) => unit.id === hero.unitId)!;
  if (!armed) unit.native!.effects = { frozenUntil: 100 };
  const until = (at: number) => {
    for (let n = 0; battle.elapsed < at - 1e-9; n++) {
      if (n > 1000 || battle.finished) throw Error('Snake Bracelet checkpoint missing');
      model.step(0.05);
    }
  };
  const recall = () => {
    const current = battle.units.find((unit) => unit.id === hero.unitId)!;
    model.activeSpell = 'recall';
    if (!model.castSpell(current.x, current.y)) throw Error('Snake Bracelet Recall failed');
    for (let n = 0; hero.unitId !== null; n++) {
      if (n > 100 || battle.finished) throw Error('King was not recalled');
      model.step(0.05);
    }
    model.activeSpell = null;
  };
  const redeploy = (x = 6.9, y = 20) => {
    if (!model.deployNativeHero('king', x, y)) throw Error('Snake Bracelet redeployment failed');
    const current = battle.units.find((unit) => unit.id === hero.unitId)!;
    if (!armed) current.native!.effects = { frozenUntil: 100 };
    return current;
  };
  return { model, battle, data, hero, unit, until, recall, redeploy };
}

/** Cannon wounds, Recall and redeployment are all real recorded inputs. */
export function snakeBraceletRecallRecording(level = 1, version = REPLAY_VERSION) {
  const r = snakeBraceletBattle(level, version, true, 1),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (r.battle.finished || r.battle.elapsed > 20)
      throw Error('Snake Bracelet combat ended early');
    r.model.step(0.05);
  };
  const snapshot = () => {
    snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  while (r.unit.hp === r.unit.maxHp) step();
  const wounded = snapshot(),
    oldId = r.unit.id;
  step();
  r.recall();
  const recalled = snapshot(),
    damageBefore = r.unit.native!.damageTaken!,
    recalledHp = r.hero.recalledHp!;
  r.until(r.battle.elapsed + 2);
  const held = snapshot();
  step();
  const unit = r.redeploy(6.9, 11.5),
    newId = unit.id;
  step();
  const returned = snapshot();
  while (unit.hp === recalledHp) step();
  const hit = snapshot(),
    damageAfter = recalledHp - unit.hp;
  step();
  step();
  const spawned = snapshot(),
    snakeIds = r.battle.units.filter((unit) => unit.kind === 'snake').map((unit) => unit.id);
  r.until(r.battle.elapsed + 0.2);
  const later = snapshot();
  step();
  r.model.finishBattle();
  return {
    level,
    oldId,
    newId,
    wounded,
    recalled,
    held,
    returned,
    hit,
    spawned,
    later,
    damageBefore,
    damageAfter,
    recalledHp,
    snakeIds,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
