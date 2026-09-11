import { describe, it, expect } from 'vitest';
import { GameModel, initialSave, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { OBSTACLES, OBSTACLE_GEMS } from '../src/game/obstacles';

describe('village obstacles', () => {
  it('blocks building, moving and saved layouts until removal completes without reserving a builder', () => {
    const m = new GameModel();
    const o = m.obstacles.find((o) => o.x === 2 && o.y === 2)!;
    const camp = m.state.buildings.find((b) => b.kind === 'camp')!;
    for (const b of m.state.buildings.slice(0, m.builders)) b.upgradeEnd = m.clock + 60000;
    expect(m.busy).toBe(m.builders);
    expect(m.canPlace('wall', o.x, o.y)).toBe(false);
    m.beginEdit();
    expect(m.dragTo(camp.id, o.x, o.y)).toBe(false);
    m.state.layouts = [{ name: 'Covered', slots: [{ id: camp.id, x: o.x, y: o.y }] }];
    const before = { x: camp.x, y: camp.y };
    m.loadLayout(0);
    expect({ x: camp.x, y: camp.y }).toEqual(before);
    expect(m.removeObstacle(o.id)).toBe(true);
    expect(m.removeObstacle(o.id)).toBe(false);
    expect(m.busy).toBe(m.builders);
    expect(m.canPlace('wall', o.x, o.y)).toBe(false);
    m.selected = -o.id;
    const gems = m.state.gems;
    m.tick(o.removeEnd!);
    expect(m.state.gems).toBe(gems + 6);
    expect(m.selected).toBeNull();
    expect(m.canPlace('wall', o.x, o.y)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
  });

  it('charges the correct resource once and cancellation refunds fully without a reward', () => {
    const m = new GameModel();
    for (const kind of ['trees', 'rocks'] as const) {
      const o = m.obstacles.find((o) => o.kind === kind)!;
      const d = OBSTACLES[kind];
      const resource = m.state[d.resource],
        gems = m.state.gems,
        xp = m.state.xp;
      expect(m.removeObstacle(o.id)).toBe(true);
      expect(m.state[d.resource]).toBe(resource - d.cost);
      expect(m.cancelObstacleRemoval(o.id)).toBe(true);
      expect(m.cancelObstacleRemoval(o.id)).toBe(false);
      expect(m.state[d.resource]).toBe(resource);
      m.tick(m.clock + 11000);
      expect(m.obstacles).toContain(o);
      expect(m.state.gems).toBe(gems);
      expect(m.state.xp).toBe(xp);
    }
  });

  it('settles offline completion once, preserves cleared villages, and supports gem finishing', () => {
    const m = new GameModel();
    const o = m.obstacles[0];
    m.removeObstacle(o.id);
    o.removeEnd = Date.now() - 1;
    o.removeStart = o.removeEnd - 10000;
    const gems = m.state.gems;
    const saved = structuredClone(m.state);
    expect(validateSave(saved)).toBe(true);
    const restored = new GameModel(saved);
    expect(restored.obstacles.some((v) => v.id === o.id)).toBe(false);
    expect(restored.state.gems).toBe(gems + 6);
    const again = new GameModel(structuredClone(restored.state));
    expect(again.state.gems).toBe(gems + 6);
    const next = again.obstacles[0];
    again.removeObstacle(next.id);
    expect(again.finishObstacleRemoval(next.id)).toBe(true);
    expect(again.state.gems).toBe(gems + 5); // One gem spent; the next obstacle contains no gems.
    again.state.obstacles = [];
    expect(new GameModel(structuredClone(again.state)).obstacles).toEqual([]);
  });

  it('persists the regular reward cycle and advances it only on completed removals', () => {
    let m = new GameModel();
    const startingGems = m.state.gems;
    for (let i = 0; i < OBSTACLE_GEMS.length; i++) {
      m.state.obstacles = [{ id: 100, kind: 'rocks', x: 2, y: 2 }];
      m.removeObstacle(100);
      m.cancelObstacleRemoval(100);
      expect(m.state.obstacleGemIndex).toBe(i);
      m.removeObstacle(100);
      const before = m.state.gems;
      m.tick(m.obstacles[0].removeEnd!);
      expect(m.state.gems - before).toBe(OBSTACLE_GEMS[i]);
      m = new GameModel(structuredClone(m.state));
    }
    expect(m.state.gems - startingGems).toBe(40);
    expect(m.state.obstacleGemIndex).toBe(0);
  });

  it('rejects unaffordable removal and battle-time edits', () => {
    const m = new GameModel();
    const o = m.obstacles[0];
    m.state.elixir = 0;
    expect(m.removeObstacle(o.id)).toBe(false);
    expect(o.removeEnd).toBeUndefined();
    m.state.elixir = 5000;
    m.removeObstacle(o.id);
    m.state.gems = 0;
    expect(m.finishObstacleRemoval(o.id)).toBe(false);
    m.startBattle(0);
    expect(m.removeObstacle(m.obstacles[1].id)).toBe(false);
    expect(m.cancelObstacleRemoval(o.id)).toBe(false);
    expect(m.finishObstacleRemoval(o.id)).toBe(false);
    expect(m.battle!.buildings.every((b) => b.id > 0)).toBe(true);
  });

  it('seeds old villages only on free ground and rejects malformed or overlapping obstacle saves', () => {
    const old = initialSave();
    delete old.obstacles;
    old.buildings.push(makeBuilding(old.nextId++, 'cannon', 2, 2));
    expect(validateSave(old)).toBe(true);
    const m = new GameModel(old);
    expect(m.obstacles.some((o) => o.x === 2 && o.y === 2)).toBe(false);
    expect(validateSave(m.state)).toBe(true);
    for (const corrupt of [
      (s: typeof old) => s.obstacles!.push({ ...s.obstacles![0] }),
      (s: typeof old) => {
        s.obstacles![0].kind = 'unknown' as 'trees';
      },
      (s: typeof old) => {
        s.obstacles![0].x = 48;
      },
      (s: typeof old) => {
        s.obstacles![0].removeEnd = Infinity;
      },
      (s: typeof old) => {
        s.obstacles![0].removeStart = 20;
        s.obstacles![0].removeEnd = 10;
      },
      (s: typeof old) => {
        s.obstacles![0].x = s.buildings[0].x;
        s.obstacles![0].y = s.buildings[0].y;
      },
      (s: typeof old) => {
        s.obstacles![1].x = s.obstacles![0].x;
        s.obstacles![1].y = s.obstacles![0].y;
      },
    ]) {
      const s = structuredClone(m.state);
      corrupt(s);
      expect(validateSave(s)).toBe(false);
    }
  });
});
