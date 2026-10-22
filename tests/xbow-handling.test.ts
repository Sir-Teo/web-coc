import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';

function village() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 40, 40, 9),
    makeBuilding(2, 'builder', 44, 44),
    makeBuilding(3, 'xbow', 10, 10),
  ];
  model.state.nextId = 4;
  const effects: FX[] = [];
  model.onEffect = (effect) => effects.push(effect);
  return { model, effects };
}

it('emits one X-Bow pickup and one successful placement, keeping blocked drops quiet', () => {
  const { model, effects } = village();
  const resources = [model.state.gold, model.state.elixir, model.state.dark];
  model.move(3);
  model.move(3);
  expect(effects.map((effect) => effect.type)).toEqual(['xbow-pickup']);
  expect(model.place(40, 40)).toBe(false);
  expect(effects.map((effect) => effect.type)).toEqual(['xbow-pickup']);
  expect(model.place(20, 20)).toBe(true);
  expect(effects).toEqual([
    { type: 'xbow-pickup', sourceId: 3, x: 11.5, y: 11.5 },
    { type: 'xbow-place', sourceId: 3, x: 21.5, y: 21.5 },
  ]);
  expect([model.state.gold, model.state.elixir, model.state.dark]).toEqual(resources);
});

it('cancels X-Bow handling without a placement event', () => {
  const { model, effects } = village();
  model.move(3);
  model.cancel();
  expect(effects.map((effect) => effect.type)).toEqual(['xbow-pickup', 'xbow-cancel']);
  expect(model.state.buildings.find((building) => building.id === 3)).toMatchObject({
    x: 10,
    y: 10,
  });
});

it('emits one pickup and placement for a complete edit drag', () => {
  const { model, effects } = village();
  model.beginEdit();
  model.beginDrag();
  expect(model.dragTo(3, 18, 20)).toBe(true);
  expect(model.dragTo(3, 20, 22)).toBe(true);
  model.endDrag();
  expect(effects.map((effect) => effect.type)).toEqual(['xbow-pickup', 'xbow-place']);
  model.undo();
  expect(model.state.buildings.find((building) => building.id === 3)).toMatchObject({
    x: 10,
    y: 10,
  });
});

it('emits a mode cue only for an accepted home X-Bow toggle', () => {
  const { model, effects } = village();
  model.selected = 2;
  expect(model.toggleXbowMode()).toBe(false);
  expect(effects).toEqual([]);
  model.selected = 3;
  expect(model.toggleXbowMode()).toBe(true);
  expect(effects).toEqual([{ type: 'xbow-mode', sourceId: 3, x: 11.5, y: 11.5 }]);
  model.startBattle(0, true);
  effects.length = 0;
  expect(model.toggleXbowMode()).toBe(false);
  model.move(3);
  expect(effects).toEqual([]);
});

it('keeps the original effect records and the building’s three home effect names', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = JSON.parse(await readFile('reference/xbow/native.json', 'utf8'));
  const runtime = JSON.parse(await readFile('reference/xbow/runtime.json', 'utf8'));
  const { XBOW_HOME_EFFECTS } = await import('../src/game/xbow-home-effects');
  expect(runtime.effects).toEqual(source.effects);
  expect(XBOW_HOME_EFFECTS).toEqual({
    pickup: source.building[0].PickUpEffect,
    place: source.building[0].PlacingEffect,
    mode: source.building[0].ToggleAttackModeEffect,
  });
});

it.each([
  ['pickup', 'xbow-bow_pickup', 0.8],
  ['place', 'xbow-bow_place', 0.8],
  ['mode', 'xbow-bow_target', 0.7],
] as const)(
  'uses the native %s sample, source volume and stable pitch range',
  async (kind, sample, volume) => {
    const { readFile } = await import('node:fs/promises');
    const { xbowHomeSoundCues } = await import('../src/game/xbow-home-effects');
    const { effects } = JSON.parse(await readFile('reference/xbow/runtime.json', 'utf8'));
    const event = { id: 17, index: 9, kind, at: 3.25 };
    const cues = xbowHomeSoundCues(event, effects);
    // The placing record also contains a visual-only row; it must not become a second sound.
    expect(cues).toHaveLength(1);
    expect(cues[0]).toMatchObject({ sample, volume, at: 3.25 });
    expect(cues[0].pitch).toBeGreaterThanOrEqual(1.1);
    expect(cues[0].pitch).toBeLessThanOrEqual(1.2);
    expect(xbowHomeSoundCues({ ...event }, effects)).toEqual(cues);
    expect(xbowHomeSoundCues({ ...event, index: 10 }, effects)[0].key).not.toBe(cues[0].key);
  },
);

it('stays silent until native effect metadata is available', async () => {
  const { xbowHomeSoundCues } = await import('../src/game/xbow-home-effects');
  expect(xbowHomeSoundCues({ id: 1, index: 1, kind: 'pickup', at: 0 }, {})).toEqual([]);
});
