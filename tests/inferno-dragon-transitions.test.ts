import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nativeDamageRampRecording } from './fixtures/native-damage-ramp';
import type { Battle } from '../src/game/model';
import { nativeUnitStats } from '../src/game/native-units';
import { stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { loadInfernoArt } from '../src/game/inferno-graph';
import {
  INFERNO_DRAGON_SOUNDS,
  infernoDragonTransitionProfile,
  infernoDragonTransitionPoses,
  infernoDragonShake,
} from '../src/game/inferno-dragon-effects';
import { infernoDragonSoundCues } from '../src/game/inferno-dragon-sounds';
import { retireInfernoDragonTransitions } from '../src/game/inferno-dragon-transitions';

await loadInfernoArt();
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const recordings = [false, true].map((defenders) =>
  nativeDamageRampRecording('infernodragon', defenders),
);
const snapshot = (defenders = false, index = 2) =>
  structuredClone(recordings[Number(defenders)].snapshots[index].battle) as Battle;

function step(battle: Battle) {
  const unit = battle.units.find((u) => u.kind === 'infernodragon')!;
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp -= amount;
    },
    effect() {},
  };
  stepNativeUnit(ctx, unit, nativeUnitStats('infernodragon', 1), 0.05);
  return unit;
}

it('ships the original pinned stage-change sample unchanged', () => {
  const sound = INFERNO_DRAGON_SOUNDS['sfx/infdragon_lvl_up_03.ogg'];
  const data = readFileSync(new URL('../public/' + sound.path, import.meta.url));
  expect(data.length).toBe(11830);
  expect(createHash('sha256').update(data).digest('hex')).toBe(
    '179c6f9fcec5f0a6ea4ae7fcba87d1de70c7b62d2416907e751acd3c5d293109',
  );
  expect(sound.sha256).toBe(createHash('sha256').update(data).digest('hex'));
});

it.each([1, 2] as const)('reads source transition stage %s parameters', (stage) => {
  expect(infernoDragonTransitionProfile(stage)).toMatchObject({
    effect: `Inf Dragon Up ${stage + 1}`,
    emitter: `DarkRay Up${stage + 1}`,
    sound: 'sfx/infdragon_lvl_up_03.ogg',
    volume: 0.6,
    pitch: stage === 1 ? 0.95 : 1.15,
    shake: stage === 1 ? 30 : 40,
    shakeDuration: stage === 1 ? 0.3 : 0.4,
    shakeReplay: true,
  });
});

it.each([false, true])('records both heat crossings once against defenders=%s', (defenders) => {
  const battle = snapshot(defenders);
  const unit = battle.units.find((u) => u.kind === 'infernodragon')!;
  const events = battle.infernoDragonTransitions!;
  expect(events.map((event) => event.stage)).toEqual([1, 2]);
  expect(events.map((event) => event.unitId)).toEqual([unit.id, unit.id]);
  for (let index = 0; index < 2; index++)
    expect(events[index].at).toBeCloseTo(
      recordings[Number(defenders)].initial + [1.7, 3.2][index],
      10,
    );
  const before = structuredClone(events);
  unit.cooldown = 1;
  step(battle);
  expect(battle.infernoDragonTransitions).toEqual(before);
});

it.each([false, true])(
  'captures a crossing before a killing pulse clears the lock, defenders=%s',
  (defenders) => {
    const battle = snapshot(defenders, 0);
    const unit = battle.units.find((u) => u.kind === 'infernodragon')!;
    const ramp = unit.native!.damageRamp!;
    const target = defenders
      ? battle.defenders!.find((d) => d.id === ramp.targetId)!
      : battle.buildings.find((b) => b.id === ramp.targetId)!;
    battle.elapsed = ramp.startedAt + 3.2;
    unit.cooldown = 0;
    target.hp = 1;
    step(battle);
    expect(target.hp).toBeLessThanOrEqual(0);
    expect(unit.native!.damageRamp).toBeUndefined();
    expect(battle.infernoDragonTransitions).toMatchObject([
      { stage: 2, at: battle.elapsed, unitId: unit.id },
    ]);
    battle.elapsed += 0.05;
    expect(infernoDragonTransitionPoses(battle, false, iso)).toHaveLength(1);
    expect(infernoDragonSoundCues(battle).filter((cue) => !cue.loop)).toHaveLength(1);
  },
);

it('records crossings between damage pulses and waits for an active attack after Freeze', () => {
  const battle = snapshot(false, 0);
  const unit = battle.units.find((u) => u.kind === 'infernodragon')!;
  const start = unit.native!.damageRamp!.startedAt;
  battle.elapsed = start + 1.7;
  unit.cooldown = 1;
  unit.native!.effects = { frozenUntil: battle.elapsed + 0.1 };
  step(battle);
  expect(battle.infernoDragonTransitions).toBeUndefined();
  battle.elapsed += 0.1;
  step(battle);
  expect(battle.infernoDragonTransitions).toMatchObject([{ stage: 1, at: battle.elapsed }]);
  expect(unit.cooldown).toBe(1);
});

it('keeps detached poses and one-shots after source death, lock loss and Freeze', () => {
  const battle = snapshot();
  const unit = battle.units.find((u) => u.kind === 'infernodragon')!;
  battle.elapsed += 0.05;
  const poses = infernoDragonTransitionPoses(battle, false, iso);
  const cues = infernoDragonSoundCues(battle).filter((cue) => !cue.loop);
  expect(poses).toHaveLength(1);
  expect(cues.at(-1)).toMatchObject({
    pitch: 1.15,
    volume: 0.6,
    at: battle.infernoDragonTransitions!.at(-1)!.at,
  });
  unit.hp = 0;
  unit.native!.effects = { frozenUntil: battle.elapsed + 10 };
  delete unit.native!.damageRamp;
  expect(infernoDragonTransitionPoses(battle, false, iso)).toEqual(poses);
  expect(infernoDragonSoundCues(battle)).toEqual(cues);
  const copy = JSON.parse(JSON.stringify(battle));
  const before = JSON.stringify(battle);
  expect(infernoDragonTransitionPoses(copy, false, iso)).toEqual(poses);
  expect(infernoDragonSoundCues(copy)).toEqual(cues);
  expect(JSON.stringify(battle)).toBe(before);
  expect(infernoDragonTransitionPoses(battle, true, iso)).toEqual([]);
});

it('uses the source height and additive export, and retires expired events', () => {
  const battle = snapshot();
  const event = battle.infernoDragonTransitions!.at(-1)!;
  const pose = infernoDragonTransitionPoses(battle, false, iso, event.at + 0.1)[0];
  expect(pose.emitter).toBe('DarkRay Up3');
  expect(pose.x).toBeCloseTo(iso(event.x, event.y).x, 10);
  expect(pose.y).toBeCloseTo(iso(event.x, event.y).y - 175 * 0.8, 10);
  expect(pose.poses[0]).toMatchObject({ blend: 8 });
  expect(infernoDragonTransitionPoses(battle, false, iso, event.at - 0.001)).toEqual([]);
  expect(infernoDragonTransitionPoses(battle, false, iso, event.at + 0.71)).toEqual([]);
  battle.elapsed = event.at + 2.01;
  retireInfernoDragonTransitions(battle);
  expect(battle.infernoDragonTransitions).toEqual([]);
});

it('keeps camera shake deterministic, bounded and disabled by reduced motion', () => {
  const battle = snapshot();
  const event = battle.infernoDragonTransitions!.at(-1)!;
  battle.elapsed = event.at + 0.1;
  const shake = infernoDragonShake(battle, false, true);
  expect(Math.hypot(shake.x, shake.y)).toBeGreaterThan(0);
  expect(Math.max(Math.abs(shake.x), Math.abs(shake.y))).toBeLessThanOrEqual(40 * 0.32);
  expect(infernoDragonShake(JSON.parse(JSON.stringify(battle)), false, true)).toEqual(shake);
  expect(infernoDragonShake(battle, true, true)).toEqual({ x: 0, y: 0 });
  battle.elapsed = event.at + 0.4;
  expect(infernoDragonShake(battle, false)).toEqual({ x: 0, y: 0 });
});
