import { afterEach, expect, it, vi } from 'vitest';
import { AudioManager } from '../src/game/audio';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function harness(state: AudioContextState = 'interrupted') {
  vi.stubGlobal('fetch', undefined);
  let visibilityChanged = () => {};
  const document = {
    hidden: false,
    addEventListener: (_: string, listener: () => void) => {
      visibilityChanged = listener;
    },
  };
  vi.stubGlobal('document', document);
  const context = {
    state,
    resume: vi.fn(async () => {
      context.state = 'running';
    }),
    suspend: vi.fn(async () => {
      context.state = 'suspended';
    }),
  };
  const audio = new AudioManager();
  audio.context = context as unknown as AudioContext;
  return { audio, context, document, visibility: () => visibilityChanged() };
}

it.each(['suspended', 'interrupted'] as const)(
  'resumes a visible %s context on a gesture',
  async (state) => {
    const { audio, context } = harness(state);
    audio.unlock();
    expect(context.resume).toHaveBeenCalledOnce();
    await flush();
    expect(context.state).toBe('running');
  },
);

it('suspends an interrupted context while hidden and resumes it on return', async () => {
  const { audio, context, document, visibility } = harness('running');
  audio.unlock();
  context.state = 'interrupted';
  document.hidden = true;
  visibility();
  expect(context.suspend).toHaveBeenCalledOnce();
  expect(context.resume).not.toHaveBeenCalled();
  document.hidden = false;
  visibility();
  await flush();
  expect(context.resume).toHaveBeenCalledOnce();
  expect(context.state).toBe('running');
});

it('coalesces gestures while an interruption keeps resume pending', async () => {
  const { audio, context } = harness();
  let finish!: () => void;
  context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  audio.unlock();
  audio.unlock();
  audio.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
  context.state = 'running';
  finish();
  await flush();
});

it('handles a rejected resume and retries on the next gesture', async () => {
  const { audio, context } = harness();
  context.resume.mockRejectedValueOnce(new Error('Audio hardware is still unavailable'));
  audio.unlock();
  await flush();
  expect(context.resume).toHaveBeenCalledOnce();
  audio.unlock();
  await flush();
  expect(context.resume).toHaveBeenCalledTimes(2);
  expect(context.state).toBe('running');
});

it('retries after hiding without letting the old resume clear a newer attempt', async () => {
  const { audio, context, document, visibility } = harness();
  const pending: (() => void)[] = [];
  context.resume.mockImplementation(() => new Promise<void>((resolve) => pending.push(resolve)));
  audio.unlock();
  document.hidden = true;
  visibility();
  document.hidden = false;
  visibility();
  expect(context.resume).toHaveBeenCalledTimes(2);
  pending[0]();
  await flush();
  audio.unlock();
  expect(context.resume).toHaveBeenCalledTimes(2);
  context.state = 'running';
  pending[1]();
  await flush();
});

it('keeps a late resume silent if the page hid while it was pending', async () => {
  const { audio, context, document, visibility } = harness();
  let finish!: () => void;
  context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  audio.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
  document.hidden = true;
  visibility();
  context.state = 'running';
  finish();
  await flush();
  expect(context.state).toBe('suspended');
});

it('does not resume a closed context', () => {
  const { audio, context, visibility } = harness('closed');
  visibility();
  expect(context.resume).not.toHaveBeenCalled();
  audio.unlock();
  expect(context.resume).not.toHaveBeenCalled();
});

it('does not unlock audio from a visibility event alone', () => {
  const { context, visibility } = harness();
  visibility();
  expect(context.resume).not.toHaveBeenCalled();
});
