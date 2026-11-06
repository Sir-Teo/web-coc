import { expect, it, vi } from 'vitest';
import { CameraShakeLayer, cameraShakePadding } from '../src/game/camera-shake-layer';

function camera() {
  const translate = vi.fn();
  const original = vi.fn();
  const value = {
    shakeEffect: { preRender: original },
    getViewMatrix: () => ({ translate }),
  } as unknown as ConstructorParameters<typeof CameraShakeLayer>[0];
  return { value, translate, original };
}

it('reports current source and impulse bounds without consuming randomness', () => {
  const c = camera();
  let time = 0;
  const source = { x: 3, y: -4 };
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.75);
  const layer = new CameraShakeLayer(
    c.value,
    () => source,
    () => time,
  );
  try {
    expect(cameraShakePadding(c.value)).toBe(4);
    layer.shake(100, 12);
    expect(cameraShakePadding(c.value)).toBe(12);
    expect(random).not.toHaveBeenCalled();
    time = 50;
    c.value.shakeEffect.preRender();
    expect(c.original).toHaveBeenCalledOnce();
    expect(c.translate).toHaveBeenCalledWith(6, -1);
    expect(random).toHaveBeenCalledTimes(2);
    time = 100;
    expect(cameraShakePadding(c.value)).toBe(4);
    source.x = 8;
    expect(cameraShakePadding(c.value)).toBe(8);
  } finally {
    layer.destroy();
    random.mockRestore();
  }
  expect(cameraShakePadding(c.value)).toBe(0);
  expect(c.value.shakeEffect.preRender).toBe(c.original);
});

it('keeps camera ownership separate and removes only the destroyed layer', () => {
  const a = camera(),
    b = camera();
  const first = new CameraShakeLayer(a.value, () => ({ x: 2, y: 0 }));
  const second = new CameraShakeLayer(a.value, () => ({ x: 0, y: 3 }));
  const other = new CameraShakeLayer(b.value, () => ({ x: 5, y: 0 }));
  expect(cameraShakePadding(a.value)).toBe(5);
  expect(cameraShakePadding(b.value)).toBe(5);
  second.destroy();
  expect(cameraShakePadding(a.value)).toBe(2);
  first.clear();
  expect(cameraShakePadding(a.value)).toBe(2);
  first.destroy();
  expect(cameraShakePadding(a.value)).toBe(0);
  expect(cameraShakePadding(b.value)).toBe(5);
  other.destroy();
});
