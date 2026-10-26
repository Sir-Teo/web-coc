import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { subtileSolid } from '../../src/game/subtile-path';

/** A Druid follows a defense-seeking airborne Hound around an ignored storage. */
export function nativeHealerRouteRecording() {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'goldstorage', 10, 5, 16),
    makeBuilding(3, 'airdefense', 25, 5, 15),
  ];
  model.state.army = { ...emptyArmy(), lavahound: 1, druid: 1, giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial));
  model.activeTroop = 'lavahound';
  if (!model.deploy(4, 6.5)) throw Error('Route Hound deployment failed');
  const target = battle.units.at(-1)!;
  model.activeTroop = 'druid';
  if (!model.deploy(2, 6.5)) throw Error('Route Druid deployment failed');
  const caster = battle.units.at(-1)!;
  const solid = subtileSolid(battle.buildings);
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  let detour: number | undefined;
  for (;;) {
    if (battle.finished || battle.elapsed > 25) throw Error('Druid did not pass the storage');
    model.step(0.05);
    if (solid(caster.x, caster.y))
      throw Error(`Druid entered the storage at ${battle.elapsed}: ${caster.x},${caster.y}`);
    if (detour === undefined && caster.x > 9 && Math.abs(caster.y - 6.5) > 0.5) {
      detour = battle.elapsed;
      snapshot();
    }
    if (caster.x > 13.5) break;
  }
  if (detour === undefined || battle.buildings[1].hp !== battle.buildings[1].maxHp)
    throw Error('Druid route did not avoid the standing storage');
  snapshot();
  const passed = battle.elapsed;
  model.step(0.05);
  model.finishBattle();
  return {
    casterId: caster.id,
    targetId: target.id,
    detour,
    passed,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
