import { describe, expect, it } from 'vitest';
import { formatTime } from '../src/game/model';

describe('countdown formatting', () => {
  it('carries rounded minutes into hours without displaying sixty minutes', () => {
    for (const [seconds, label] of [
      [3600, '1h'],
      [3630, '1h 1m'],
      [7169, '1h 59m'],
      [7170, '2h'],
      [7199, '2h'],
      [7200, '2h'],
      [10799, '3h'],
      [86399, '24h'],
    ] as const) {
      expect(formatTime(seconds), `${seconds} seconds`).toBe(label);
    }
  });

  it('keeps seconds below an hour and normalizes rounded minute boundaries', () => {
    for (const [seconds, label] of [
      [-1, '0s'],
      [0, '0s'],
      [1, '1s'],
      [59.4, '59s'],
      [59.5, '1m'],
      [61, '1m 1s'],
      [3599.4, '59m 59s'],
      [3599.5, '1h'],
    ] as const) {
      expect(formatTime(seconds), `${seconds} seconds`).toBe(label);
    }
  });
});
