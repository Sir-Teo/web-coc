import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function updatePrompt() {
  vi.resetModules();
  const listeners = new Map<string, () => void>();
  const clicks = new Map<string, () => void>();
  const worker = { state: 'installed', postMessage: vi.fn() };
  const previous = { state: 'activated', postMessage: vi.fn() };
  const registration = {
    installing: null,
    waiting: worker,
    addEventListener: vi.fn(),
  };
  const container = {
    controller: previous,
    register: vi.fn().mockResolvedValue(registration),
    addEventListener: (type: string, callback: () => void) => listeners.set(type, callback),
  };
  const button = {
    disabled: false,
    addEventListener: (type: string, callback: () => void) => clicks.set(type, callback),
  };
  const append = vi.fn();
  const reload = vi.fn();
  vi.stubGlobal('navigator', { serviceWorker: container });
  vi.stubGlobal('location', { origin: 'https://game.example' });
  vi.stubGlobal('document', {
    documentElement: { dataset: {} },
    getElementById: () => null,
    createElement: () => button,
    body: { append },
  });
  vi.stubGlobal('window', {
    requestIdleCallback: true,
    addEventListener: vi.fn(),
    location: { reload },
  });
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => callback());
  const { registerOfflineSupport } = await import('../src/offline');
  registerOfflineSupport();
  await Promise.resolve();
  expect(append).toHaveBeenCalledWith(button);
  const accept = () => clicks.get('click')!();
  const changed = () => listeners.get('controllerchange')!();
  return { worker, container, button, reload, accept, changed };
}

it.each(['activating', 'activated', 'redundant'])(
  'reloads an accepted update already %s after another tab changed the controller',
  async (state) => {
    const h = await updatePrompt();
    h.worker.state = state;
    h.container.controller = h.worker;
    h.changed();
    expect(h.reload).not.toHaveBeenCalled();
    h.worker.postMessage.mockClear();
    h.accept();
    expect(h.button.disabled).toBe(true);
    expect(h.reload).toHaveBeenCalledOnce();
    expect(h.worker.postMessage).not.toHaveBeenCalled();
    // A late controller event must not cause a second document navigation.
    h.changed();
    expect(h.reload).toHaveBeenCalledOnce();
  },
);

it('activates an installed update and reloads when its controller takes over', async () => {
  const h = await updatePrompt();
  h.accept();
  expect(h.worker.postMessage).toHaveBeenCalledWith({ type: 'activate-update' });
  expect(h.reload).not.toHaveBeenCalled();
  h.changed();
  expect(h.reload).toHaveBeenCalledOnce();
});

it('reloads when an installed worker can no longer receive the activation request', async () => {
  const h = await updatePrompt();
  h.worker.postMessage.mockImplementation(() => {
    throw Error('Worker disappeared');
  });
  h.accept();
  expect(h.reload).toHaveBeenCalledOnce();
});
