import { afterEach, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/audio';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function harness() {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline'));
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const osc = {
    frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as null | (() => void),
  };
  const gain = {
    gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  const context = {
    currentTime: 5,
    state: 'running',
    destination: {},
    createOscillator: () => osc,
    createGain: () => gain,
    suspend: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
  };
  const audio = new AudioManager();
  audio.context = context as unknown as AudioContext;
  return { audio, osc, gain, context };
}

it('stops generated fallback tones when effects are muted while music remains on', () => {
  const { audio, osc, gain, context } = harness();
  audio.music(true);
  audio.play('deploy');
  expect(osc.start).toHaveBeenCalledOnce();
  expect(osc.stop).toHaveBeenCalledWith(5.12);
  const ended = osc.onended;
  audio.enabled = false;
  expect(osc.stop).toHaveBeenLastCalledWith();
  expect(osc.disconnect).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
  expect(context.suspend).not.toHaveBeenCalled();
  ended?.();
  audio.enabled = true;
  audio.enabled = false;
  expect(osc.stop).toHaveBeenCalledTimes(2);
  expect(osc.disconnect).toHaveBeenCalledOnce();
});

it('drops generated tails when the page hides instead of resuming them on return', () => {
  let visibilityChanged: () => void;
  const document = {
    hidden: false,
    addEventListener: (_: string, listener: () => void) => {
      visibilityChanged = listener;
    },
  };
  vi.stubGlobal('document', document);
  const { audio, osc, gain, context } = harness();
  audio.play('deploy');
  const ended = osc.onended;
  document.hidden = true;
  visibilityChanged!();
  expect(context.suspend).toHaveBeenCalledOnce();
  expect(osc.stop).toHaveBeenLastCalledWith();
  expect(osc.disconnect).toHaveBeenCalledOnce();
  vi.mocked(performance.now).mockReturnValue(1100);
  audio.play('destroy');
  expect(osc.start).toHaveBeenCalledOnce();
  document.hidden = false;
  visibilityChanged!();
  ended?.();
  expect(osc.start).toHaveBeenCalledOnce();
  expect(gain.disconnect).toHaveBeenCalledOnce();
});

it('does not queue fallback tones while the browser is resuming its audio context', () => {
  const { audio, osc, context } = harness();
  context.state = 'suspended';
  audio.play('deploy');
  expect(context.resume).toHaveBeenCalledOnce();
  expect(osc.start).not.toHaveBeenCalled();
});
