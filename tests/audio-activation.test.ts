import { afterEach, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/audio';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['play', 'effect'] as const)(
  'recovers music-only audio through %s without playing effects',
  async (cue) => {
    vi.stubGlobal('fetch', undefined);
    const context = {
      state: 'running',
      resume: vi.fn(async () => {
        context.state = 'running';
      }),
      suspend: vi.fn().mockResolvedValue(undefined),
    };
    const audio = new AudioManager();
    audio.context = context as unknown as AudioContext;
    audio.music(true);
    audio.enabled = false;
    const shot = vi.spyOn(audio.samples, 'shot').mockReturnValue(true);
    audio.feedback = vi.fn();
    context.state = 'interrupted';
    if (cue === 'play') audio.play('click');
    else audio.effect('Collect Gold', 'collect');
    expect(context.resume).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(context.state).toBe('running');
    expect(shot).not.toHaveBeenCalled();
    expect(audio.feedback).toHaveBeenCalledWith(cue === 'play' ? 'click' : 'collect');
  },
);

it('keeps all-off feedback silent without opening an audio context', () => {
  vi.stubGlobal('fetch', undefined);
  const audio = new AudioManager();
  audio.enabled = false;
  audio.play('click');
  audio.effect('Collect Gold', 'collect');
  expect(audio.context).toBe(null);
});
