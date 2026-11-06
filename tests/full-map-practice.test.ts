import { defendingHero, stepDefendingHeroes } from '../src/game/defending-heroes';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { stepDefenders } from '../src/game/defenders';
import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { NATIVE_CAMPAIGN } from '../src/game/native-campaign';
import { PRACTICE_LEVELS } from '../src/game/practice-mode';
import {
  replayBattle,
  validateReplay,
  compatibleReplayVersion,
  REPLAY_VERSION,
} from '../src/game/replay';
import { battleMapSize } from '../src/game/grid';
import { nearestPassable } from '../src/game/garrison-abilities';
import { groundCollision } from '../src/game/subtile-path';
import { stepAirPush } from '../src/game/air-sweeper';
import { separationCrowd } from './fixtures/crowd-separation';

function recording() {
  const m = new GameModel();
  m.townhall!.level = 12;
  m.startCampaign(90, false);
  m.deploy(51, 1);
  m.step(0.05);
  m.finishBattle();
  return m.state.raidLog![0].replay!;
}

it('takes full-map bounds from pinned source Practice metadata only in the new replay era', () => {
  expect(REPLAY_VERSION).toBe(233);
  const { initial } = recording();
  expect(NATIVE_CAMPAIGN.filter((s) => s.useFullMapSize)).toHaveLength(15);
  expect(replayBattle(initial).boardSize).toBe(52);
  for (const version of [44, 51, 232]) {
    expect(compatibleReplayVersion(version)).toBe(true);
    expect(replayBattle(initial, version).boardSize).toBeUndefined();
  }
  for (const setup of [
    { ...initial, fixedArmy: undefined },
    { ...initial, index: 0 },
    { ...initial, practice: true },
    { ...initial, catalog: 'valley-v1' as const },
  ])
    expect(battleMapSize(replayBattle(setup))).toBe(48);
});

it('validates full-board deployments and footprints without widening older recordings', () => {
  const replay = recording();
  expect(replay.actions[0]).toMatchObject({ type: 'troop', x: 51, y: 1 });
  expect(validateReplay(replay)).toBe(true);
  expect(validateReplay({ ...replay, version: 232 })).toBe(false);
  const shifted = structuredClone(replay);
  shifted.initial.buildings[0] = makeBuilding(1, 'townhall', 48, 48, 4);
  expect(validateReplay(shifted)).toBe(true);
  expect(validateReplay({ ...shifted, version: 232 })).toBe(false);
  shifted.initial.buildings[0].x = 49;
  expect(validateReplay(shifted)).toBe(false);
  expect(
    validateReplay({ ...replay, initial: { ...replay.initial, index: Object.create(null) } }),
  ).toBe(false);
});

it('preserves source guide points at tile 51 while old battle bounds still clamp them', () => {
  const level = PRACTICE_LEVELS.find((l) => l.id === 'CHALLENGE_TH9_LAVALOON')!;
  const step = level.steps.find((s) => s.at?.x === 51)!;
  expect(step.at).toEqual({ x: 51, y: 29 });
  const m = new GameModel();
  m.townhall!.level = 12;
  m.startCampaign(level.stage! - 1);
  const initialize = () => {
    m.practiceGuide = { steps: [step], index: 0, placed: 0, elapsed: 0 };
    (m as unknown as { beginGuideStep(): void }).beginGuideStep();
  };
  initialize();
  expect(m.practiceGuide!.spot).toEqual(step.at);
  expect(m.deployBlocked(51, 29)).toBe(false);
  delete m.battle!.boardSize;
  initialize();
  expect(m.practiceGuide!.spot!.x).toBeLessThanOrEqual(47);
  expect(m.deployBlocked(51, 29)).toBe(true);
});

it('keeps secondary spawns on full-board passable ground', () => {
  const spot = { x: 50.25, y: 12.25 };
  expect(
    nearestPassable(groundCollision({ nativeSubtiles: true, boardSize: 52 }, []), spot.x, spot.y),
  ).toEqual(spot);
  expect(
    nearestPassable(groundCollision({ nativeSubtiles: true }, []), spot.x, spot.y)!.x,
  ).toBeLessThan(48);
});

it('keeps air pushback beyond the old edge on the larger board', () => {
  const unit = separationCrowd(1)[0];
  unit.x = 50;
  unit.y = 12;
  unit.airPush = { x: 1, y: 0, remaining: 1 };
  expect(stepAirPush(unit, 0.05, 52)).toBe(true);
  expect(unit.x).toBeGreaterThan(48);
});

it.each(['hero', 'garrison'] as const)(
  'routes a ground %s toward attackers beyond the old edge',
  (kind) => {
    const m = new GameModel();
    m.townhall!.level = 12;
    m.startCampaign(90, false);
    const b = m.battle!;
    b.buildings = [makeBuilding(1, 'townhall', 10, 10, 4)];
    b.defenders = [];
    const attacker = separationCrowd(1)[0];
    attacker.x = 51;
    attacker.y = 12;
    b.units = [attacker];
    const defender =
      kind === 'hero'
        ? defendingHero({ kind: 'king', level: 1, x: 49, y: 12 }, 0)
        : spawnGarrisonDefender(b, 'pekka', 8, 1, 49, 12, 0);
    b.defenders = [defender];
    for (let i = 0; i < 5; i++) {
      b.elapsed += 0.05;
      if (kind === 'hero') stepDefendingHeroes(b, 0.05, () => {});
      else stepDefenders(b, 0.05, () => {});
    }
    expect(defender.target).toBe(attacker.id);
    expect(defender.x).toBeGreaterThan(49);
  },
);
