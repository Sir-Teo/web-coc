import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { buildingEffects } from '../../src/game/native-status';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A real Skeleton Spell. Unshielded bodies come from an actual Wizard Tower shield break. */
export function attackingSpellSkeletonBattle(
  level = 1,
  version = REPLAY_VERSION,
  unshielded = false,
  x = unshielded ? 13.7 : 11.4,
  controlled = true,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(unshielded
      ? [makeBuilding(2, 'wizardtower', 13, 10, 2), makeBuilding(3, 'barracks', 17, 10, 16)]
      : [makeBuilding(2, 'barracks', 13, 10, 16)]),
  ];
  model.state.army = { ...emptyArmy(), archer: 1 };
  model.state.spells = { ...emptySpells(), skeleton: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, skeleton: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    kind = unshielded ? 'spellskeleton' : 'spellskeletonshielded';
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeSpell = 'skeleton';
  if (!model.castSpell(x, 11.5)) throw Error('Skeleton Spell fixture cast failed');
  let unit: Battle['units'][number] | undefined;
  const freezeOthers = () => {
    if (controlled && unit) {
      for (const other of battle.units)
        if (other !== unit) (other.native!.effects ??= {}).frozenUntil = 100;
      if (unshielded) {
        battle.defenseStuns[2] = 100;
        buildingEffects(
          battle,
          battle.buildings.find((b) => b.id === 2)!,
        ).frozenUntil = 100;
      }
    }
  };
  const step = (dt = 0.05) => {
    if (battle.finished || battle.elapsed > 40) throw Error('Skeleton Spell checkpoint missing');
    freezeOthers();
    model.step(dt);
    unit ??= battle.units.find((u) => u.kind === kind);
    freezeOthers();
  };
  while (!unit) step();
  const skeleton = unit;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((skeleton.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, data, kind, unit: skeleton, step, until, untilAttacks };
}

/** All bodies and shield breaks are produced by untouched ordinary battle inputs. */
export function attackingSpellSkeletonRecording(
  level = 1,
  version = REPLAY_VERSION,
  unshielded = false,
  x = unshielded ? 13.7 : 11.4,
) {
  const r = attackingSpellSkeletonBattle(level, version, unshielded, x, false),
    snapshots: { at: number; battle: Battle }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.unit.attacking) r.step();
  const engaged = snapshot();
  r.untilAttacks(1);
  const first = snapshot();
  r.until(first + 0.2);
  const recovery = snapshot();
  r.untilAttacks(2);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.unit.id,
    kind: r.kind,
    born,
    engaged,
    first,
    recovery,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
