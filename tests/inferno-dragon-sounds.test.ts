import { expect, it, vi } from 'vitest';
import { infernoDragonSoundCues } from '../src/game/inferno-dragon-sounds';
import { nativeDamageRampRecording } from './fixtures/native-damage-ramp';
import { BattleSoundLog, troopSample } from '../src/game/troop-sounds';
import { SampleAudio } from '../src/game/sample-audio';
import type { Battle } from '../src/game/model';

const recording = nativeDamageRampRecording('infernodragon', true);
const snapshot = (index = 2) => structuredClone(recording.snapshots[index].battle) as Battle;

it.each([0, 1, 2])('uses the source looping fire sample and stage %s pitch', (stage) => {
  const b = snapshot(stage);
  const cue = infernoDragonSoundCues(b)[0];
  expect(cue).toMatchObject({
    sample: troopSample('sfx/infdragon_fireloop_01.ogg'),
    volume: 0.3,
    pitch: [1, 1.2, 1.4][stage],
    loop: true,
  });
  expect(cue.at).toBeCloseTo(recording.initial + [0, 1.7, 3.2][stage], 12);
  const before = JSON.stringify(b);
  expect(infernoDragonSoundCues(b)).toEqual([cue]);
  expect(JSON.stringify(b)).toBe(before);
});

it('keeps the same source key within a stage, then replaces it for a new stage or target', () => {
  const b = snapshot(0),
    first = infernoDragonSoundCues(b)[0];
  for (let i = 0; i < 8; i++) {
    b.elapsed += 0.05;
    expect(infernoDragonSoundCues(b)[0]).toEqual(first);
  }
  const middle = infernoDragonSoundCues(snapshot(1))[0];
  expect(middle.key).not.toBe(first.key);
  const next = infernoDragonSoundCues(snapshot(3))[0];
  expect(next.key).not.toBe(first.key);
  expect(next.at).toBeCloseTo(recording.retargeted, 12);
  expect(next.pitch).toBe(1);
});

it.each([
  'dead',
  'frozen',
  'stunned',
  'idle',
  'recalled',
  'hidden-target',
  'dead-target',
  'recovering',
  'finished',
  'old',
] as const)('stops the fire loop when %s', (state) => {
  const b = snapshot(),
    u = b.units.find((u) => u.id === recording.unitId)!;
  const target = b.defenders!.find((d) => d.id === recording.firstTargetId)!;
  if (state === 'dead') u.hp = 0;
  if (state === 'frozen') u.native!.effects = { frozenUntil: b.elapsed + 1 };
  if (state === 'stunned') u.native!.effects = { stunUntil: b.elapsed + 1 };
  if (state === 'idle') u.attacking = false;
  if (state === 'recalled') u.native!.recalled = true;
  if (state === 'hidden-target') target.invisibleUntil = b.elapsed + 1;
  if (state === 'dead-target') target.hp = 0;
  if (state === 'recovering') delete u.native!.damageRamp;
  if (state === 'finished') b.finished = true;
  if (state === 'old') delete b.nativeTroopDamageRamp;
  expect(infernoDragonSoundCues(b)).toEqual([]);
});

it('does not log repeated native attack starts and preserves historical attack sounds', () => {
  const b = snapshot(),
    u = b.units.find((u) => u.id === recording.unitId)!;
  const log = new BattleSoundLog();
  for (let i = 0; i < 10; i++) {
    b.elapsed += 0.05;
    log.attack(b, u, 'attack');
  }
  expect(log.cues(b).filter((c) => c.sample.includes('infdragon_fireloop'))).toEqual([]);
  delete b.nativeTroopDamageRamp;
  log.attack(b, u, 'attack');
  expect(log.cues(b).filter((c) => c.sample.includes('infdragon_fireloop'))).toHaveLength(1);
});

it('holds one audio node, changes stage pitch, and resumes pause/seek offsets through the shared player', async () => {
  const nodes: any[] = [];
  const context = {
    state: 'running',
    currentTime: 0,
    destination: {},
    decodeAudioData: vi.fn(async () => ({ duration: 2 })),
    createBufferSource: () => {
      const node = {
        playbackRate: { value: 1 },
        loop: false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        onended: null,
      };
      nodes.push(node);
      return node;
    },
    createGain: () => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() }),
  };
  const player = new SampleAudio(() => context as unknown as AudioContext);
  player.register(troopSample('sfx/infdragon_fireloop_01.ogg'), new ArrayBuffer(4));
  await Promise.resolve();
  const b = snapshot(0);
  player.sync(infernoDragonSoundCues(b), b.elapsed, 1, true);
  expect(nodes).toHaveLength(1);
  expect(nodes[0].loop).toBe(true);
  b.elapsed += 0.05;
  context.currentTime += 0.05;
  player.sync(infernoDragonSoundCues(b), b.elapsed, 1, true);
  expect(nodes).toHaveLength(1);
  const middle = snapshot(1);
  player.sync(infernoDragonSoundCues(middle), middle.elapsed, 2, true);
  expect(nodes.at(-1).playbackRate.value).toBe(2.4);
  expect(nodes[0].stop).toHaveBeenCalledOnce();
  const maximum = snapshot(2),
    cue = infernoDragonSoundCues(maximum)[0];
  player.sync([cue], maximum.elapsed, 1, true);
  const last = nodes.at(-1);
  expect(last.playbackRate.value).toBe(1.4);
  expect(last.start).toHaveBeenCalledWith(0, ((maximum.elapsed - cue.at) * 1.4) % 2);
  player.sync([cue], maximum.elapsed, 1, false);
  expect(last.stop).toHaveBeenCalledOnce();
  player.sync([cue], maximum.elapsed, 1, true);
  expect(nodes.at(-1)).not.toBe(last);
  player.sync(infernoDragonSoundCues(b), b.elapsed, 1, true);
  expect(nodes.at(-1).playbackRate.value).toBe(1);
  player.sync([], b.elapsed, 1, true);
  expect(nodes.at(-1).stop).toHaveBeenCalledOnce();
});
