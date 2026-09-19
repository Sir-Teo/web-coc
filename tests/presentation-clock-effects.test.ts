import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import type { Battle } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonImpactPoses } from '../src/game/garrison-effects';
import { darkDrillDestructionPoses } from '../src/game/dark-drill-effects';
import {
  PRESENTATION_GRACE,
  presentationLive,
  presentationTime,
} from '../src/game/presentation-clock';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
/** What the presentations draw at wall time `now` (ms): gated by the grace window. */
const garrisonAt = (battle: Battle, now: number) =>
  presentationLive(battle, now)
    ? garrisonImpactPoses(battle, false, iso, 46, presentationTime(battle, now))
    : [];

it('keeps garrison bursts animating after the finish, then clears them after the grace', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = spawnGarrisonDefender(battle, 'balloon', 8, 1, 10, 10, 0);
  defender.attacks.push({ at: 1, x: 10, y: 10, targetId: 1, targetX: 11, targetY: 11 });
  battle.elapsed = 1.02;
  // Seen running first, then the final tick finishes the battle mid-burst.
  expect(garrisonAt(battle, 0).length).toBeGreaterThan(0);
  battle.finished = true;
  const atFinish = garrisonAt(battle, 1000);
  expect(atFinish.length).toBeGreaterThan(0);
  // 50 ms later the burst has advanced on the presentation clock instead of freezing.
  const later = garrisonAt(battle, 1050);
  expect(later.length).toBeGreaterThan(0);
  expect(later).not.toEqual(atFinish);
  expect(presentationTime(battle, 1050)).toBeCloseTo(1.07, 9);
  // Exactly what the same burst looks like 50 ms later in a running battle.
  expect(later).toEqual(garrisonImpactPoses(battle, false, iso, 46, 1.07));
  // The battle clock itself never moves.
  expect(battle.elapsed).toBe(1.02);
  // After the grace window nothing is drawn.
  expect(presentationLive(battle, 1000 + PRESENTATION_GRACE * 1000 + 1)).toBe(false);
  expect(garrisonAt(battle, 1000 + PRESENTATION_GRACE * 1000 + 1)).toEqual([]);
});

it('plays a dark drill destruction out on the presentation clock', () => {
  const battle = { elapsed: 10.05, finished: false } as Battle;
  const history = { 7: { at: 10, x: 12, y: 14, level: 3 } };
  const at = (now: number) =>
    presentationLive(battle, now)
      ? darkDrillDestructionPoses(history, presentationTime(battle, now), false, iso)
      : [];
  expect(at(0).length).toBeGreaterThan(0);
  battle.finished = true;
  const frozen = at(500);
  const moving = at(600);
  expect(frozen.length).toBeGreaterThan(0);
  expect(moving.length).toBeGreaterThan(0);
  expect(moving).not.toEqual(frozen);
  expect(at(500 + PRESENTATION_GRACE * 1000 + 1)).toEqual([]);
});
