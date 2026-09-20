import { describe, expect, it } from 'vitest';
import { sortByDepth } from '../src/game/display-sort';

type Item = { _depth: number; id: number };
const item = (depth: number, id: number) => ({ _depth: depth, id }) as Item;
/** The order Phaser's stable sort leaves, used as the reference. */
const reference = (list: Item[]) =>
  list
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value._depth - b.value._depth || a.index - b.index)
    .map((entry) => entry.value);

const sorted = (list: Item[]) => {
  const copy = list.slice();
  sortByDepth(copy as never);
  return copy;
};

describe('sortByDepth', () => {
  it('leaves an ordered list untouched', () => {
    const list = [item(1, 0), item(2, 1), item(2, 2), item(9, 3)];
    expect(sorted(list)).toEqual(list);
  });

  it('orders by depth and keeps ties in their original order', () => {
    const list = [item(5, 0), item(1, 1), item(5, 2), item(1, 3), item(3, 4)];
    expect(sorted(list).map((v) => v.id)).toEqual([1, 3, 4, 0, 2]);
  });

  it('handles empty and single-item lists', () => {
    expect(sorted([])).toEqual([]);
    expect(sorted([item(3, 0)]).map((v) => v.id)).toEqual([0]);
  });

  it('matches a stable reference sort on random lists, including duplicates', () => {
    let seed = 12345;
    const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    for (const size of [2, 3, 7, 33, 100, 1000, 4097]) {
      const list = Array.from({ length: size }, (_, id) =>
        item(Math.floor(random() * Math.max(2, size / 4)), id),
      );
      expect(sorted(list).map((v) => v.id)).toEqual(reference(list).map((v) => v.id));
    }
  });

  it('matches the reference on a nearly ordered list with a few displaced runs', () => {
    const list = Array.from({ length: 2000 }, (_, id) => item(id, id));
    for (const at of [10, 500, 1200, 1999]) list[at] = item(-at, at);
    expect(sorted(list).map((v) => v.id)).toEqual(reference(list).map((v) => v.id));
  });

  it('sorts negative, fractional and equal depths together', () => {
    const list = [item(-1.5, 0), item(0, 1), item(-1.5, 2), item(0.25, 3), item(-2, 4)];
    expect(sorted(list).map((v) => v.id)).toEqual(reference(list).map((v) => v.id));
  });
});
