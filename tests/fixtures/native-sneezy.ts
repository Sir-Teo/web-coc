import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeUnitStats } from '../../src/game/native-units';

/** Input-only Sneezy summons and mode transition after actual Cannon damage knocks out its Hero. */
export function nativeSneezyRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 1, 1, 21),
    makeBuilding(3, 'cannon', 1, 4, 21),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'sneezy', level } }];
  const battle = (model.battle = replayBattle(data.initial));
  if (!model.deployNativeHero('king', 6, 6.5) || !model.activateNativeHeroAbility('king'))
    throw Error('Sneezy Hero inputs failed');
  const owner = battle.nativeHeroes![0],
    hero = battle.units.find((u) => u.id === owner.unitId)!,
    pet = battle.units.find((u) => u.id === owner.petId)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 30)
      throw Error(`Sneezy checkpoint not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const initial = battle.elapsed;
  until(1.5);
  snapshot();
  const summoning = battle.elapsed;
  if (!pet.native?.sneezySummon || owner.sneezyTransformed || hero.hp <= 0)
    throw Error('Sneezy initial summon mode missing');
  if (
    !battle.nativePendingSpawns?.some(
      (spawn) => spawn.kind === 'booger' && spawn.owner === pet.id && spawn.at === 2.5,
    )
  )
    throw Error('Sneezy source Booger arrival missing');
  until(2.55);
  const child = battle.units.find((u) => u.kind === 'booger' && u.native?.owner === pet.id)!;
  if (!child) throw Error('Sneezy completed Booger arrival missing');
  snapshot();
  const born = battle.elapsed;
  while (!owner.sneezyTransformed) step();
  const transformed = battle.elapsed;
  snapshot();
  let shot;
  while (
    !(shot = battle.projectiles?.find(
      (p) => p.sourceId === pet.id && p.impact > battle.elapsed + 0.05,
    ))
  )
    step();
  if (Math.abs(shot.damage - nativeUnitStats('sneezy', level).damage * 1.01) > 1e-8)
    throw Error('Sneezy native outgoing self-rage differs');
  const firing = battle.elapsed;
  snapshot();
  step();
  model.finishBattle();
  return {
    level,
    initial,
    summoning,
    born,
    transformed,
    firing,
    petId: pet.id,
    heroId: hero.id,
    childId: child.id,
    shotId: shot.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
