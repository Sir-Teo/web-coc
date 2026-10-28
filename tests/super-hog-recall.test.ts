import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { hurtUnit } from '../src/game/native-status';
import { nativeUnitStats } from '../src/game/native-units';
import { SPLIT_HOG_KINDS } from '../src/game/recalled-split-troops';
import { needsRecallPresentation } from '../src/game/native-recall';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { superHogRecallBattle, superHogRecallRecording } from './fixtures/super-hog-recall';

function halves(level = 1, version?: number) {
  const r = superHogRecallBattle(level, version);
  r.step();
  hurtUnit(r.battle, r.unit, r.unit.maxHp);
  r.step();
  const hog = r.battle.units.find((u) => u.kind === 'superhog')!;
  hog.native!.effects = { frozenUntil: 100 };
  const impact = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!.impact;
  r.until(impact);
  const rider = r.battle.units.find((u) => u.kind === 'superrider')!;
  rider.native!.effects = { frozenUntil: 100 };
  return { ...r, hog, rider };
}
function recall(r: ReturnType<typeof halves>) {
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell((r.hog.x + r.rider.x) / 2, (r.hog.y + r.rider.y) / 2)).toBe(true);
  const cast = r.battle.nativeSpells!.find((c) => c.name === 'Recall')!;
  while (r.battle.units.some((u) => u.id === r.hog.id || u.id === r.rider.id)) r.step();
  r.model.activeSpell = null;
  return cast;
}

for (let level = 1; level <= 12; level++)
  it(`Recall returns source level-${level} halves with their own health and five housing each`, () => {
    const r = halves(level),
      housing = r.battle.nativeMonolithHousing;
    hurtUnit(r.battle, r.hog, 11);
    hurtUnit(r.battle, r.rider, 17);
    // Frozen bodies remain damageable and hold their positions for this controlled cast.
    const hp = { superhog: r.hog.hp, superrider: r.rider.hp };
    const cast = recall(r);
    expect(cast.budget).toBe(73);
    for (const kind of SPLIT_HOG_KINDS) {
      expect(r.model.troopRemaining(kind)).toBe(1);
      expect(r.model.troopLevel(kind)).toBe(level);
      expect(r.model.troopDisplayLevel(kind)).toBe(level + 3);
      expect(r.battle.recalledSplits![kind]).toEqual([{ level, hp: hp[kind], owner: r.unit.id }]);
      r.model.activeTroop = kind;
      expect(r.model.deploy(11.4, 11.5)).toBe(true);
      const unit = r.battle.units.at(-1)!;
      expect(unit).toMatchObject({
        kind,
        level,
        hp: hp[kind],
        maxHp: nativeUnitStats(kind, level).hp,
        spawnedAt: r.battle.elapsed,
        native: { owner: r.unit.id },
      });
      expect(unit.native!.attackWindup).toBeUndefined();
      expect(unit.native!.effects?.frozenUntil).toBeUndefined();
      expect(r.model.troopRemaining(kind)).toBe(0);
    }
    expect(r.battle.nativeMonolithHousing).toBe(housing);
    expect(Object.hasOwn(r.model.state.army, 'superhog')).toBe(false);
    expect(Object.hasOwn(r.model.state.army, 'superrider')).toBe(false);
  });

it('returned halves keep combat open with no remaining army or attacking units', () => {
  const r = halves();
  recall(r);
  r.battle.spells.freeze = 0;
  r.until(r.battle.elapsed + 1);
  expect(Object.values(r.battle.remaining).every((n) => n === 0)).toBe(true);
  expect(r.battle.units.some((u) => u.hp > 0)).toBe(false);
  expect(r.battle.finished).toBe(false);
});
it('a cold reserve still warms Recall feedback after the last spell and old effects expire', () => {
  const r = halves();
  recall(r);
  r.battle.spells.recall = 0;
  r.battle.nativeRecallEvents = [];
  expect(needsRecallPresentation(r.battle)).toBe(true);
  r.battle.recalledSplits = {};
  expect(needsRecallPresentation(r.battle)).toBe(false);
});
it('invalid placements and empty reserve clicks consume no body or replay action', () => {
  const r = halves();
  recall(r);
  r.model.activeTroop = 'superhog';
  const next = r.model.state.nextId,
    actions = r.data.actions.length;
  for (const [x, y] of [
    [NaN, 1],
    [Infinity, 1],
    [-1, 2],
    [49, 2],
    [14.5, 11.5],
  ])
    expect(r.model.deploy(x, y)).toBe(false);
  expect(r.model.state.nextId).toBe(next);
  expect(r.data.actions).toHaveLength(actions);
  expect(r.model.troopRemaining('superhog')).toBe(1);
  expect(r.model.deploy(11.4, 11.5)).toBe(true);
  const after = r.model.state.nextId;
  expect(r.model.deploy(11.4, 11.5)).toBe(false);
  expect(r.model.state.nextId).toBe(after);
});
it('a five-space remainder returns the earlier-born Hog and leaves the Rider', () => {
  const r = halves();
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell((r.hog.x + r.rider.x) / 2, r.hog.y)).toBe(true);
  const cast = r.battle.nativeSpells!.find((c) => c.name === 'Recall')!;
  cast.budget = 5;
  while (r.battle.units.some((u) => u.id === r.hog.id)) r.step();
  expect(r.model.troopRemaining('superhog')).toBe(1);
  expect(r.model.troopRemaining('superrider')).toBe(0);
  expect(r.battle.units.some((u) => u.id === r.rider.id)).toBe(true);
  expect(cast.budget).toBe(0);
});
it('Clone copies of split halves remain ineligible for Recall', () => {
  const r = halves();
  r.hog.native!.cloneUntil = 100;
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell((r.hog.x + r.rider.x) / 2, r.hog.y)).toBe(true);
  while (r.battle.units.some((u) => u.id === r.rider.id)) r.step();
  expect(r.model.troopRemaining('superhog')).toBe(0);
  expect(r.model.troopRemaining('superrider')).toBe(1);
  expect(r.battle.units.some((u) => u.id === r.hog.id)).toBe(true);
});
it('mid-battle JSON restoration retains a reserve without granting a second body', () => {
  const r = halves(12);
  recall(r);
  const model = new GameModel();
  model.state.nextId = r.model.state.nextId;
  model.battle = JSON.parse(JSON.stringify(r.battle));
  model.activeTroop = 'superrider';
  expect(model.deploy(11.4, 11.5)).toBe(true);
  expect(model.battle!.units.at(-1)).toMatchObject({
    kind: 'superrider',
    level: 12,
    hp: r.rider.hp,
  });
  expect(model.deploy(11.4, 11.5)).toBe(false);
  model.returnHome();
  expect(model.activeTroop).toBe('superhogrider');
  expect(Object.hasOwn(model.state.army, 'superrider')).toBe(false);
});
for (const kind of SPLIT_HOG_KINDS)
  it(`returned ${kind} starts a fresh full melee windup`, () => {
    const r = halves();
    recall(r);
    r.model.activeTroop = kind;
    expect(r.model.deploy(11.4, 11.5)).toBe(true);
    const unit = r.battle.units.at(-1)!;
    while (!unit.attacking) r.step();
    const engaged = r.battle.elapsed;
    while (!unit.native?.attacks) r.step();
    expect(r.battle.elapsed - engaged + 0.05).toBeCloseTo(1, 8);
  });
it('recalling the Hog leaves its airborne sibling linked to the original landing', () => {
  const r = superHogRecallBattle();
  r.step();
  hurtUnit(r.battle, r.unit, r.unit.maxHp);
  r.step();
  const hog = r.battle.units.find((u) => u.kind === 'superhog')!;
  hog.native!.effects = { frozenUntil: 100 };
  const shot = r.battle.projectiles!.find((p) => p.native?.superHogSplit)!;
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell(hog.x, hog.y)).toBe(true);
  while (r.battle.units.some((u) => u.id === hog.id)) r.step();
  expect(r.battle.elapsed).toBeLessThan(shot.impact);
  expect(r.model.troopRemaining('superhog')).toBe(1);
  r.until(shot.impact);
  expect(r.battle.units.filter((u) => u.kind === 'superrider')).toHaveLength(1);
  expect(r.model.troopRemaining('superrider')).toBe(0);
});
it('a living parent continues to return through its original combined card', () => {
  const r = superHogRecallBattle();
  r.model.activeSpell = 'recall';
  expect(r.model.castSpell(r.unit.x, r.unit.y)).toBe(true);
  while (r.battle.units.some((u) => u.id === r.unit.id)) r.step();
  expect(r.battle.remaining.superhogrider).toBe(1);
  expect(r.battle.recalledSplits).toBeUndefined();
});

for (const level of [1, 12])
  for (const version of [178, 179])
    it(`actual level-${level} Monolith/Recall/redeploy recording reproduces version ${version}`, () => {
      const r = superHogRecallRecording(level, version),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(s.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
      }
      expect(r.data.actions.filter((a) => a.type === 'recalled-troop')).toHaveLength(
        version >= 179 ? 2 : 0,
      );
    });
it('new reserve deployment inputs reject earlier versions and unknown kinds', () => {
  const r = superHogRecallRecording();
  expect(validateReplay(r.data)).toBe(true);
  expect(validateReplay({ ...r.data, version: 178 })).toBe(false);
  const noRecall = structuredClone(r.data);
  noRecall.initial.spells.recall = 0;
  expect(validateReplay(noRecall)).toBe(false);
  const invalid = structuredClone(r.data),
    action = invalid.actions.find((a) => a.type === 'recalled-troop')!;
  (action as unknown as { kind: string }).kind = 'superhogrider';
  expect(validateReplay(invalid)).toBe(false);
});
it('only current Super Hog Rider armies carrying Recall enable the reserve adapter', () => {
  const s = structuredClone(superHogRecallBattle().data.initial);
  expect(replayBattle(s).nativeSplitRecall).toBe(true);
  expect(replayBattle(s, 178).nativeSplitRecall).toBeUndefined();
  s.spells.recall = 0;
  expect(replayBattle(s).nativeSplitRecall).toBeUndefined();
});
