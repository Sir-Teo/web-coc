import { GameModel, makeBuilding } from '../../src/game/model';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** A source Frostmite crosses a standing Wall line, spends itself on one jump and chills a Cannon. */
export function nativeFrostmiteRecording(level = 1) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'cannon', 11, 5, 21),
    ...Array.from({ length: 16 }, (_, y) => makeBuilding(100 + y, 'wall', 7, y, 18)),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [], pet: { kind: 'frosty', level } }];
  const battle = (model.battle = replayBattle(data.initial));
  if (!model.deployNativeHero('king', 3, 6.5))
    throw Error('Frosty native recording deployment failed');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => ({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  const step = () => {
    if (battle.finished || battle.elapsed > 12)
      throw Error('Frostmite recording checkpoint missing');
    model.step(0.05);
  };
  step();
  snapshots.push(snapshot());
  const initial = battle.elapsed;
  const child = battle.units.find((u) => u.kind === 'frostmite')!;
  if (!child) throw Error('Frosty did not summon its Frostmite');
  let previous = snapshot(),
    crossed = false;
  while (!child.spent) {
    previous = snapshot();
    step();
    if (child.x >= 7 && child.x < 8) crossed = true;
  }
  if (!crossed) throw Error('Frostmite did not cross the standing wall line');
  const shot = battle.projectiles?.find(
    (p) => p.sourceId === child.id && p.native?.name === 'FrostmiteJump',
  );
  if (!shot) throw Error('Frostmite did not hand its spent body to its native leap');
  snapshots.push(previous);
  const beforeJump = previous.at,
    launched = battle.elapsed;
  step();
  step();
  snapshots.push(snapshot());
  const inFlight = battle.elapsed;
  while (battle.elapsed < shot.impact) step();
  const frost = battle.buildingEffects?.[2]?.frost;
  if (!frost || frost.percent !== 0.5 || frost.until <= battle.elapsed)
    throw Error('Frostmite target did not receive its slow');
  if (battle.buildings.filter((b) => b.kind === 'wall').some((b) => b.hp <= 0))
    throw Error('The wall line was breached before the Frostmite leap');
  snapshots.push(snapshot());
  const landed = battle.elapsed;
  step();
  model.finishBattle();
  return {
    level,
    initial,
    beforeJump,
    launched,
    inFlight,
    landed,
    childId: child.id,
    targetId: 2,
    shotId: shot.id,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
