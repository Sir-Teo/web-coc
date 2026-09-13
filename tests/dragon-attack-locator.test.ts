import { expect, it } from 'vitest';
import { dragonAttackOffset, dragonFacing, GARRISON_GRAPHS } from '../src/game/garrison-poses';

it('uses the original empty source locator for each view and mirrors it with the body', () => {
  for (const [dx, dy, view, x, y] of [
    [0, -1, 1, 26.950000762939453, -91.4000015258789],
    [1, -1, 2, 52.95000076293945, -57.400001525878906],
    [1, 0, 3, 25.950000762939453, -23.399999618530273],
  ]) {
    const name = `dragon7_fly1_${view}`;
    expect(dragonFacing(dx, dy).name).toBe(name);
    expect(dragonAttackOffset(dx, dy)).toEqual({ x: x * 0.6, y: y * 0.6 });
    expect(dragonAttackOffset(dy, dx)).toEqual({ x: -x * 0.6, y: y * 0.6 });
    const graph = GARRISON_GRAPHS.dragon;
    const clip = graph.clips[graph.exports[name]];
    expect(clip.timeline).toHaveLength(1);
    const child = clip.children[clip.names.indexOf('attack_pivot')];
    expect(graph.clips[graph.clips[child].children[0]].children).toEqual([]);
  }
});
