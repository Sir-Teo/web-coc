import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { spellRandom } from '../../src/game/native-spells';
import type { ReplayData } from '../../src/game/replay';

/** A real Giant held at a wall, just inside Rage's aimed ring and outside the old shifted pulse. */
export function spellAreaCenterRecording() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 20, 18),
    makeBuilding(2, 'cannon', 41, 23, 1),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 9, y, 18)),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 2 };
  model.state.spells = { ...emptySpells(), rage: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  model.activeTroop = 'giant';
  if (!model.deploy(5, 24)) throw Error('Area-center Giant deployment failed');
  const giant = battle.units[0];
  for (let remaining = 400; !giant.attacking; remaining--) {
    if (!remaining || battle.finished) throw Error('Giant did not reach its blocking wall');
    model.step(0.05);
  }
  model.step(0.05);
  const seed =
    (Math.imul(battle.seed, 7919) + Math.imul((battle.nativeSpellSequence ?? 0) + 1, 104729)) >>> 0;
  const angle = spellRandom(seed, 0) * Math.PI * 2;
  const center = { x: giant.x + Math.cos(angle) * 4.9, y: giant.y + Math.sin(angle) * 4.9 };
  model.activeSpell = 'rage';
  if (!model.castSpell(center.x, center.y)) throw Error('Area-center Rage cast failed');
  const cast = battle.nativeSpells!.find((cast) => cast.name === 'Rage')!;
  if (!cast || cast.seed !== seed) throw Error('Rage sequence changed before the fixture cast');
  const until = (at: number) => {
    for (let remaining = 400; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Area-center checkpoint was not reached');
      model.step(0.05);
    }
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(cast.firstHit - 0.05);
  snapshot();
  const before = battle.elapsed;
  until(cast.firstHit + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(hit + 0.3);
  snapshot();
  const later = battle.elapsed;
  until(later + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    before,
    hit,
    later,
    center,
    giantId: giant.id,
  };
}
