import { afterEach, expect, it, vi } from 'vitest';
import source from '../reference/field-spells/effects.json';
import { winningLightningBattle } from './fixtures/winning-lightning';
import { NativeSpellCastPresentation } from '../src/game/native-spell-cast-scene';
import { settlePresentation } from '../src/game/presentation-clock';

// Keep the renderer's lifecycle real while replacing only the GPU layer in this Node test.
const drawn = vi.hoisted(() => [] as { key: string; elapsed: number }[]);
vi.mock('../src/game/native-effect-layer', () => ({
  nativeEffectPack: (name: string) => name,
  NativeEffectLayer: class {
    begin() {
      drawn.length = 0;
    }
    end() {}
    clear() {
      drawn.length = 0;
    }
    status() {
      return 'ready';
    }
    duration() {
      return 2;
    }
    play(event: { key: string }, elapsed: number) {
      drawn.push({ key: event.key, elapsed });
      return true;
    }
  },
}));
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const view = () =>
  new NativeSpellCastPresentation(
    {} as never,
    {} as never,
    'Lightning',
    'lightning',
    source.spells.Lightning.levels,
  );
afterEach(() => vi.restoreAllMocks());

it('keeps the real winning Lightning hit drawing on presentation time while combat remains frozen', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const r = winningLightningBattle(),
    layer = view();
  layer.render(r.battle, false, iso);
  r.finish();
  const before = JSON.stringify(r.battle);
  layer.render(r.battle, false, iso);
  expect(drawn).toContainEqual({ key: `spell:${r.cast.id}:hit:0`, elapsed: r.battle.elapsed });
  now.mockReturnValue(1100);
  layer.render(r.battle, false, iso);
  expect(drawn.find((e) => e.key.endsWith(':hit:0'))!.elapsed).toBeCloseTo(
    r.battle.elapsed + 0.1,
    10,
  );
  expect(JSON.stringify(r.battle)).toBe(before);
  now.mockReturnValue(3100);
  layer.render(r.battle, false, iso);
  expect(drawn).toEqual([]);
});

it('does not create unresolved deployment, charging or hit phases after End Battle', () => {
  const now = vi.spyOn(performance, 'now').mockReturnValue(1000);
  const r = winningLightningBattle(),
    layer = view();
  layer.render(r.battle, false, iso);
  r.model.finishBattle();
  layer.render(r.battle, false, iso);
  const before = JSON.stringify(r.battle);
  now.mockReturnValue(1850);
  layer.render(r.battle, false, iso);
  expect(drawn.map((e) => e.key)).toEqual([`spell:${r.cast.id}:preDeploy`]);
  expect(r.cast.hits).toBe(0);
  expect(JSON.stringify(r.battle)).toBe(before);
});

it('settles finished spell views immediately when requested and keeps cold imports quiet', () => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  const r = winningLightningBattle(),
    layer = view();
  layer.render(r.battle, false, iso);
  r.finish();
  layer.render(r.battle, false, iso);
  expect(drawn.length).toBeGreaterThan(0);
  const cold = JSON.parse(JSON.stringify(r.battle));
  view().render(cold, false, iso);
  expect(drawn).toEqual([]);
  settlePresentation(r.battle);
  layer.render(r.battle, false, iso);
  expect(drawn).toEqual([]);
});

it('keeps reduced-motion spell views empty without changing their finishing state', () => {
  const r = winningLightningBattle(),
    layer = view();
  layer.render(r.battle, true, iso);
  r.finish();
  const before = JSON.stringify(r.battle);
  layer.render(r.battle, true, iso);
  expect(drawn).toEqual([]);
  expect(JSON.stringify(r.battle)).toBe(before);
});
