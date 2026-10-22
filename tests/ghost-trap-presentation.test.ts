import { expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { AudioManager } from '../src/game/audio';
import { GhostTrapPresentation } from '../src/game/ghost-trap-scene';
import { ghostTrapFrame } from '../src/game/ghost-trap-art';
import { makeBuilding } from '../src/game/model';

function fixture() {
  const textures = new Set<string>();
  const image = vi.fn();
  const scene = {
    textures: { exists: (key: string) => textures.has(key) },
    add: { image },
  } as unknown as Phaser.Scene;
  const trap = makeBuilding(1, 'bomb', 10, 10, 1);
  trap.npc = 'ghost-trap';
  const view = new GhostTrapPresentation(scene, {} as AudioManager);
  return { textures, image, trap, view };
}

it('waits for both shared coffin atlases and observes their later release', () => {
  const { textures, trap, view } = fixture();
  const armed = ghostTrapFrame(undefined, 0, false).art.texture;
  const triggered = ghostTrapFrame(0, 0, false).art.texture;
  expect(view.handles(trap)).toBe(false);
  textures.add(armed);
  expect(view.handles(trap)).toBe(false);
  textures.add(triggered);
  expect(view.handles(trap)).toBe(true);
  expect(view.handles(makeBuilding(2, 'bomb', 12, 12))).toBe(false);
  textures.delete(triggered);
  expect(view.handles(trap)).toBe(false);
});

it('never creates a missing-texture body while shared art is unavailable', () => {
  const { trap, view, image } = fixture();
  expect(
    view.render({
      buildings: [trap],
      battle: null,
      elapsed: 0,
      reduced: false,
      iso: (x, y) => ({ x, y }),
      airLift: 0,
    }),
  ).toEqual([]);
  expect(image).not.toHaveBeenCalled();
});
