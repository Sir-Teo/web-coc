import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Unit } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function yetiRecallBattle(
  level = 1,
  version = REPLAY_VERSION,
  armed = false,
  count = 1,
  kind: 'yeti' | 'superyeti' = 'yeti',
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(armed ? [makeBuilding(2, 'cannon', 13, 10, 21)] : []),
  ];
  model.state.army = { ...emptyArmy(), [kind]: count, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, yeti: level, superyeti: level };
  model.state.spells = { ...emptySpells(), recall: 2 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  const deploy = (x = 6.9, y = 11.5, troopKind = kind) => {
    model.activeSpell = null;
    model.activeHero = false;
    model.activeHeroKind = null;
    model.activeTroop = troopKind;
    if (!model.deploy(x, y)) throw Error('Yeti deployment failed');
    const unit = battle.units.at(-1)!;
    if (!armed) unit.native!.effects = { frozenUntil: 100 };
    return unit;
  };
  const unit = deploy();
  const until = (at: number) => {
    for (let n = 0; battle.elapsed < at - 1e-9; n++) {
      if (n > 1000 || battle.finished) throw Error('Yeti checkpoint missing');
      model.step(0.05);
    }
  };
  const recall = (unit: Unit) => {
    model.activeSpell = 'recall';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Yeti Recall failed');
    for (let n = 0; !unit.native?.recalled; n++) {
      if (n > 100 || battle.finished) throw Error('Yeti was not recalled');
      model.step(0.05);
    }
    model.activeSpell = null;
  };
  const children = () =>
    battle.units.filter((unit) => unit.kind === (kind === 'yeti' ? 'yetimite' : 'electromite'));
  return { model, battle, data, unit, deploy, until, recall, children };
}

/** Only actual Cannon wounds, Recall, a wait and troop redeployment are recorded. */
export function yetiRecallRecording(
  kind: 'yeti' | 'superyeti' = 'yeti',
  level = 1,
  version = REPLAY_VERSION,
) {
  const r = yetiRecallBattle(level, version, true, 1, kind),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (r.battle.finished || r.battle.elapsed > 20) throw Error('Yeti combat checkpoint missing');
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
  r.recall(r.unit);
  const recalled = snapshot(),
    damageBefore = r.unit.native!.damageTaken!,
    hp = r.battle.recalledHp![kind]![0];
  r.until(r.battle.elapsed + 2);
  const held = snapshot();
  step();
  const unit = r.deploy(),
    newId = unit.id;
  step();
  const returned = snapshot(),
    required = kind === 'yeti' ? 384 : 256;
  while (unit.hp > hp - required) step();
  const hit = snapshot(),
    damageAfter = hp - unit.hp;
  step();
  const spawned = snapshot(),
    childIds = r.children().map((unit) => unit.id);
  r.until(r.battle.elapsed + 0.15);
  const later = snapshot();
  step();
  r.model.finishBattle();
  return {
    kind,
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
    hp,
    childIds,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
