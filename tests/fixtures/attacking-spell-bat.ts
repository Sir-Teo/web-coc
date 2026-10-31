import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding, type Battle } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** A real Bat Spell over a ground-only Cannon; no troop is injected. */
export function attackingSpellBatBattle(
  level = 1,
  version = REPLAY_VERSION,
  x = 12,
  controlled = true,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 100;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 13, 10, 21),
  ];
  model.state.army = { ...emptyArmy(), archer: 1 };
  model.state.spells = { ...emptySpells(), bat: 1 };
  model.state.spellLevels = { ...model.state.spellLevels, bat: level };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  model.activeHero = false;
  model.activeHeroKind = null;
  model.activeSpell = 'bat';
  if (!model.castSpell(x, 11.5)) throw Error('Bat Spell fixture cast failed');
  let unit: Battle['units'][number] | undefined;
  const freezeOthers = () => {
    if (controlled && unit)
      for (const other of battle.units)
        if (other !== unit) (other.native!.effects ??= {}).frozenUntil = 100;
  };
  const step = () => {
    if (battle.finished || battle.elapsed > 40) throw Error('Bat Spell checkpoint missing');
    freezeOthers();
    model.step(0.05);
    unit ??= battle.units.find((u) => u.kind === 'spellbat');
    freezeOthers();
  };
  while (!unit) step();
  const bat = unit;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const untilAttacks = (count: number) => {
    while ((bat.native?.attacks ?? 0) < count) step();
  };
  return { model, battle, data, unit: bat, step, until, untilAttacks };
}

/** Untouched battle samples are suitable for portable forward/backward replay checks. */
export function attackingSpellBatRecording(level = 1, version = REPLAY_VERSION, x = 12) {
  const r = attackingSpellBatBattle(level, version, x, false),
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
    born,
    engaged,
    first,
    recovery,
    second,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
