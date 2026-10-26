import { GameModel, makeBuilding } from '../../src/game/model';
import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Real attacks: siege immunity beside a Healer, or Tantrum before/after a Phoenix hatch. */
export function nativeFriendlyRecording(mode: 'healing' | 'rage') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 10, 5, 21),
    makeBuilding(3, 'cannon', 10, 8, 21),
  ];
  model.state.army = {
    ...emptyArmy(),
    giant: 2,
    ...(mode === 'healing' ? { wallwrecker: 1, healer: 1, swordsman: 2 } : { babydragon: 1 }),
  };
  model.state.spells = emptySpells();
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes =
    mode === 'rage'
      ? [{ kind: 'king', level: 1, items: [], pet: { kind: 'phoenix', level: 1 } }]
      : [];
  const battle = (model.battle = replayBattle(data.initial));
  const step = () => {
    if (battle.finished || battle.elapsed > 20)
      throw Error(`Friendly ${mode} checkpoint not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  let initial: number, changed: number, actorId: number, otherId: number;
  if (mode === 'healing') {
    model.activeTroop = 'wallwrecker';
    if (!model.deploy(5, 6.5)) throw Error('Friendly siege deployment failed');
    const siege = battle.units.at(-1)!;
    otherId = siege.id;
    model.activeTroop = 'healer';
    if (!model.deploy(3, 6.5)) throw Error('Friendly Healer deployment failed');
    const healer = battle.units.at(-1)!;
    actorId = healer.id;
    while (battle.elapsed < 1 - 1e-9) step();
    // Let the Cannons acquire the siege before placing its tiny neighboring group.
    // Those troops qualify only if immune siege housing is incorrectly counted.
    model.activeTroop = 'swordsman';
    if (!model.deploy(siege.x - 1, siege.y) || !model.deploy(siege.x - 1, siege.y))
      throw Error('Friendly small-group deployment failed');
    step();
    if (siege.hp >= siege.maxHp || healer.healTarget !== undefined)
      throw Error('Friendly Healer did not idle beside the damaged siege');
    snapshot();
    initial = battle.elapsed;
    step();
    model.activeTroop = 'giant';
    if (!model.deploy(4, 6.5)) throw Error('Friendly patient deployment failed');
    const giant = battle.units.at(-1)!;
    while (!battle.projectiles?.some((p) => p.weapon === 'healing' && p.targetId === giant.id))
      step();
    snapshot();
    changed = battle.elapsed;
    step();
  } else {
    if (!model.deployNativeHero('king', 5, 6.5)) throw Error('Friendly Phoenix deployment failed');
    if (!model.activateNativeHeroAbility('king')) throw Error('Friendly ability input failed');
    const owner = battle.nativeHeroes![0];
    otherId = owner.petId!;
    model.activeTroop = 'babydragon';
    if (!model.deploy(3, 6.5)) throw Error('Friendly Baby Dragon deployment failed');
    const baby = battle.units.at(-1)!;
    actorId = baby.id;
    step();
    if (!baby.native!.alone) throw Error('Waiting bird incorrectly cancels Tantrum');
    snapshot();
    initial = battle.elapsed;
    while (!owner.phoenix!.used) step();
    step();
    if (baby.native!.alone) throw Error('Hatched bird did not cancel nearby Tantrum');
    snapshot();
    changed = battle.elapsed;
    step();
  }
  model.finishBattle();
  return {
    mode,
    initial,
    changed,
    actorId,
    otherId,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
