import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { nativeUnitStats } from '../../src/game/native-units';

/** A real Cannon wounds the Hero, then the carried Healer's level-scaled pulse restores HP. */
export function healerHeroScalingRecording(level = 11) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 1, 4, 21),
  ];
  model.state.army = { ...emptyArmy(), healer: 1, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, healer: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [] }];
  const battle = (model.battle = replayBattle(data.initial));
  if (!model.deployNativeHero('king', 6, 6.5) || !model.activateNativeHeroAbility('king'))
    throw Error('Healer Hero inputs failed');
  const hero = battle.units.find((u) => u.id === battle.nativeHeroes![0].unitId)!;
  model.activeTroop = 'healer';
  if (!model.deploy(8, 6.5)) throw Error('Healer deployment failed');
  const healer = battle.units.at(-1)!;
  const step = () => {
    if (battle.finished || battle.elapsed > 12)
      throw Error(`Healer recovery not reached at ${battle.elapsed}`);
    model.step(0.05);
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshots.push(snapshot());
  const initial = battle.elapsed;
  let before: number, healed: number, gain: number, captured: number | undefined;
  for (;;) {
    const previous = snapshot();
    const hp = hero.hp;
    const packet = battle.projectiles?.find(
      (p) => p.weapon === 'healing' && p.sourceId === healer.id,
    );
    step();
    if (hero.hp <= hp + 1e-9) continue;
    gain = hero.hp - hp;
    captured = packet?.healingHeroScale;
    const source = nativeUnitStats('healer', level);
    if (Math.abs(gain - source.heal * source.heroMultiplier) > 1e-8)
      throw Error(`Healer recovery differs from its source tier: ${gain}`);
    snapshots.push(previous, snapshot());
    before = previous.at;
    healed = battle.elapsed;
    break;
  }
  step();
  model.finishBattle();
  return {
    level,
    initial,
    before,
    healed,
    gain,
    captured,
    heroId: hero.id,
    healerId: healer.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
