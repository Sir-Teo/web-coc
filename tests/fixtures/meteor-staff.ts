import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

export function meteorStaffBattle(
  level = 1,
  version = REPLAY_VERSION,
  ordinary = false,
  recall = false,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, ordinary ? 'elixirstorage' : 'cannon', 13, 10, ordinary ? 14 : 21),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), invisibility: 1, ...(recall ? { recall: 1 } : {}) };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'prince', level: 1, items: [{ slug: 'meteor-staff', level }] }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('prince', 6.9, 11.5))
    throw Error('Meteor Staff Prince deployment failed');
  const hero = battle.nativeHeroes![0],
    unit = battle.units.find((u) => u.id === hero.unitId)!;
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) {
      if (battle.finished || battle.elapsed > 45) throw Error('Meteor Staff checkpoint missing');
      model.step(0.05);
    }
  };
  return { model, battle, data, hero, unit, until };
}

/** Actual Prince inputs and optional Invisibility cover the original nearest Cannon. */
export function meteorStaffRecording(hidden = false, version = REPLAY_VERSION) {
  const r = meteorStaffBattle(1, version, !hidden),
    { model, battle, until } = r;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  until(8.2);
  const beforeSpell = snapshot();
  if (hidden) {
    model.step(0.05);
    model.activeSpell = 'invisibility';
    if (!model.castSpell(14.5, 11.5)) throw Error('Meteor Staff Invisibility failed');
  }
  until(9.8);
  const beforeCast = snapshot();
  until(10.05);
  const cast = snapshot();
  until(11.05);
  const beforeHit = snapshot();
  until(11.2);
  const hit = snapshot();
  model.step(0.05);
  model.finishBattle();
  return {
    hidden,
    unitId: r.unit.id,
    beforeSpell,
    beforeCast,
    cast,
    beforeHit,
    hit,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
