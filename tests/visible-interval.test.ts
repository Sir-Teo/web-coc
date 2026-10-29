import { afterEach, expect, it, vi } from 'vitest';
import { visibleInterval } from '../src/ui/visible-interval';

class Visibility extends EventTarget {
  hidden = false;
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const page = (hidden = false) => {
  vi.useFakeTimers();
  const document = new Visibility();
  document.hidden = hidden;
  vi.stubGlobal('document', document);
  return document;
};

it('suspends hidden work and resumes once per interval without catching up missed ticks', () => {
  const document = page(),
    callback = vi.fn();
  const stop = visibleInterval(callback, 250);
  vi.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalledTimes(4);
  document.setHidden(true);
  expect(vi.getTimerCount()).toBe(0);
  vi.advanceTimersByTime(5000);
  expect(callback).toHaveBeenCalledTimes(4);
  document.setHidden(false);
  vi.advanceTimersByTime(249);
  expect(callback).toHaveBeenCalledTimes(4);
  vi.advanceTimersByTime(1);
  expect(callback).toHaveBeenCalledTimes(5);
  stop();
});

it('starts no timer for an initially hidden document and keeps cadence across repeated events', () => {
  const document = page(true),
    callback = vi.fn();
  const stop = visibleInterval(callback, 1000);
  expect(vi.getTimerCount()).toBe(0);
  document.setHidden(false);
  vi.advanceTimersByTime(500);
  document.setHidden(false);
  expect(vi.getTimerCount()).toBe(1);
  vi.advanceTimersByTime(500);
  expect(callback).toHaveBeenCalledTimes(1);
  stop();
});

it('cleanup removes the timer and visibility listener, even while hidden', () => {
  const document = page(),
    callback = vi.fn();
  const stop = visibleInterval(callback, 250);
  document.setHidden(true);
  stop();
  document.setHidden(false);
  vi.advanceTimersByTime(1000);
  expect(callback).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
