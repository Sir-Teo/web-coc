import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { stepInfernos } from '../src/game/inferno-battle';
import { infernoSoundCues } from '../src/game/inferno-sounds';
import { infernoImpactPoses } from '../src/game/inferno-effects';
it('records each heat crossing once and keeps detached transition cues after freeze', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.buildings = [makeBuilding(1, 'inferno', 10, 10)];
  battle.units = [{ id: 1, kind: 'giant', x: 12, y: 11, hp: 50000, maxHp: 50000 } as Unit];
  const seen = new Map<number, number>();
  for (let tick = 1; tick <= 85; tick++) {
    battle.elapsed = tick * 0.064;
    stepInfernos(battle, 0.064);
    for (const event of battle.infernos![1].transitions ?? []) seen.set(event.at, event.stage);
  }
  expect([...seen]).toEqual([
    [1.536, 1],
    [5.312, 2],
  ]);
  expect(battle.infernos![1].transitions).toHaveLength(1);
  const copy = JSON.parse(JSON.stringify(battle));
  const iso = (x: number, y: number) => ({ x: x * 32, y: y * 16 });
  expect(infernoImpactPoses(copy, false, iso)).toEqual(infernoImpactPoses(battle, false, iso));
  expect(infernoSoundCues(copy)).toEqual(infernoSoundCues(battle));
  battle.defenseStuns[1] = 10;
  const cues = infernoSoundCues(battle);
  expect(cues).toHaveLength(1);
  expect(cues[0]).toMatchObject({
    at: 5.312,
    sample: 'inferno-beam_up_02.ogg',
    pitch: 1.1,
    volume: 0.75,
  });
  expect(
    infernoImpactPoses(battle, false, iso).filter((p) => p.emitter === 'DarkRay Up3'),
  ).toHaveLength(1);
  stepInfernos(battle, 0);
  expect(battle.infernos![1].transitions).toHaveLength(1);
});
