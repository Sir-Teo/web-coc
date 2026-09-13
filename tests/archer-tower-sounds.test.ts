import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Effect } from '../src/game/model';
import { archerTowerHandlingCues } from '../src/game/archer-tower-sounds';
it('uses the original handling samples, volume, pitch and event identity', () => {
  const events = [
    { id: 1, index: 1, kind: 'pickup' as const, at: 10, x: 2, y: 3 },
    { id: 1, index: 2, kind: 'place' as const, at: 10.5, x: 5, y: 6 },
  ];
  expect(archerTowerHandlingCues(events)).toEqual([
    {
      key: 'archer-tower:handling:1:1',
      sample: 'archer-tower-archer_tower_pick_01.ogg',
      at: 10,
      volume: 0.8,
      pitch: 1,
    },
    {
      key: 'archer-tower:handling:1:2',
      sample: 'archer-tower-archer_tower_place_02.ogg',
      at: 10.5,
      volume: 0.8,
      pitch: 1,
    },
  ]);
});
it('emits pickup, successful placement and cancellation without sounding rejected moves', () => {
  const model = new GameModel();
  model.state.obstacles = [];
  const b = makeBuilding(999, 'archertower', 2, 2);
  model.state.buildings.push(b);
  const events: Effect[] = [];
  model.onEffect = (e) => events.push(e);
  model.move(b.id);
  expect(model.place(0, 0)).toBe(false);
  expect(events.map((e) => e.type)).toEqual(['archertower-pickup']);
  expect(model.place(35, 35)).toBe(true);
  model.move(b.id);
  model.cancel();
  expect(events.map((e) => e.type)).toEqual([
    'archertower-pickup',
    'archertower-place',
    'archertower-pickup',
    'archertower-cancel',
  ]);
  expect(events[1]).toMatchObject({ sourceId: 999, x: 36.5, y: 36.5 });
});

it('retains overlapping release cues with deterministic source variants and bounded history', async () => {
  const { archerTowerBattle } = await import('./fixtures/archer-tower-battle');
  const { archerTowerReleaseCues } = await import('../src/game/archer-tower-sounds');
  const model = archerTowerBattle();
  for (let i = 0; i < 80; i++) model.step(0.05);
  const battle = model.battle!;
  expect(battle.archerTowerReleases!.length).toBeGreaterThan(1);
  expect(battle.archerTowerReleases!.length).toBeLessThanOrEqual(5);
  const before = JSON.stringify(battle);
  const cues = archerTowerReleaseCues(battle);
  expect(cues.length).toBeGreaterThan(1);
  expect(new Set(cues.map((c) => c.key)).size).toBe(cues.length);
  for (const cue of cues) {
    expect(cue.volume).toBe(0.5);
    expect(cue.pitch).toBeGreaterThanOrEqual(0.9);
    expect(cue.pitch).toBeLessThanOrEqual(1.1);
    expect(cue.sample).toMatch(/^archer-tower-arrow_hit_07(v2|v3)?\.ogg$/);
  }
  expect(archerTowerReleaseCues(JSON.parse(before))).toEqual(cues);
  expect(JSON.stringify(battle)).toBe(before);
  battle.elapsed += 2;
  expect(archerTowerReleaseCues(battle)).toEqual([]);
  delete battle.nativeArcherTowers;
  expect(archerTowerReleaseCues(battle)).toEqual([]);
});
