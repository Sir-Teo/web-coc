import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { guardianStats, type GuardianKind } from '../../src/game/native-guardians';
import type { GuardianDefender } from '../../src/game/defenders';

/** A real Guardian landing and trading three attacks with a durable King, optionally in Poison. */
export function guardianAnimationRecording(kind: GuardianKind, poison = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [{ ...makeBuilding(1, 'townhall', 20, 20, 18), guardian: kind }];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), ...(poison ? { poison: 1 } : {}) };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.heroes = [{ kind: 'king', level: 100, items: [] }];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const guardian = () =>
    battle.defenders?.find((d) => d.kind === 'guardian') as GuardianDefender | undefined;
  let tick = 0;
  const step = () => {
    if (++tick > 400 || battle.finished || (guardian()?.hp ?? 1) <= 0)
      throw Error('Guardian animation checkpoint was not reached');
    model.step(0.05);
  };
  if (poison) {
    model.activeSpell = 'poison';
    if (!model.castSpell(22, 18)) throw Error('Guardian animation Poison failed');
    // Let the bottle/pulse delay settle before triggering the Guardian's leap.
    while (battle.elapsed < 2 - 1e-9) step();
  }
  if (!model.deployNativeHero('king', 22, 16))
    throw Error('Guardian animation opponent deployment failed');
  while (!guardian()?.attacking) step();
  const g = guardian()!;
  const start = g.clock!;
  const interval = guardianStats(kind, g.level).interval;
  const samples: { at: number; age: number; battle: unknown }[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    while (g.clock! < start + cycle * interval + 0.25 - 1e-9) step();
    samples.push({
      at: battle.elapsed,
      age: g.clock! - start - cycle * interval,
      battle: JSON.parse(JSON.stringify(battle)),
    });
  }
  const guardianId = g.id;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    samples,
    guardianId,
    poison,
  };
}
