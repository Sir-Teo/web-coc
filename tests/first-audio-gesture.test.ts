import { expect, it, vi } from 'vitest';
import { onFirstAudioGesture } from '../src/ui/first-audio-gesture';

const key = (target: EventTarget, fields: Partial<KeyboardEvent> & { key: string }) => {
  const event = Object.assign(new Event('keydown'), {
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...fields,
  });
  target.dispatchEvent(event);
};

it.each(['Tab', 'Enter', ' ', 'a', 'A', '1'])(
  'accepts %j as an unlocking keyboard gesture',
  (value) => {
    const target = new EventTarget(),
      activate = vi.fn();
    onFirstAudioGesture(activate, target);
    key(target, { key: value });
    expect(activate).toHaveBeenCalledOnce();
  },
);

it.each(['pointer', 'keyboard'])(
  'unlocks once when %s comes first and removes both listeners',
  (first) => {
    const target = new EventTarget(),
      activate = vi.fn();
    onFirstAudioGesture(activate, target);
    if (first === 'pointer') target.dispatchEvent(new Event('pointerdown'));
    else key(target, { key: 'Tab' });
    target.dispatchEvent(new Event('pointerdown'));
    key(target, { key: 'Enter' });
    expect(activate).toHaveBeenCalledOnce();
  },
);

it('leaves the first gesture available after modifiers, browser chords and held keys', () => {
  const target = new EventTarget(),
    activate = vi.fn();
  onFirstAudioGesture(activate, target);
  for (const fields of [
    { key: 'Shift' },
    { key: 'Escape' },
    { key: 'CapsLock' },
    { key: 'F5' },
    { key: 'r', ctrlKey: true },
    { key: 'r', metaKey: true },
    { key: 'a', altKey: true },
    { key: 'a', repeat: true },
  ])
    key(target, fields);
  expect(activate).not.toHaveBeenCalled();
  key(target, { key: 'Tab' });
  expect(activate).toHaveBeenCalledOnce();
});

it('can cancel both listeners before any activation', () => {
  const target = new EventTarget(),
    activate = vi.fn();
  const cancel = onFirstAudioGesture(activate, target);
  cancel();
  target.dispatchEvent(new Event('pointerdown'));
  key(target, { key: 'Tab' });
  expect(activate).not.toHaveBeenCalled();
});
