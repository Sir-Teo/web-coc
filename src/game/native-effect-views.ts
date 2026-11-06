import type Phaser from 'phaser';
import { NativeSceneView, effectSceneView } from './native-scene-view';
import type { NativeParticlePose } from './native-particles';
import { nativeEffectInView } from './native-scene-culling';
import { cameraShakePadding } from './camera-shake-layer';

/** Parked views kept per layer for reuse; beyond this they are destroyed. */
const SPARE_LIMIT = 48;

/**
 * Keyed transient effect views (particles, trail births) with a reuse pool.
 *
 * Particles live a fraction of a second, and each used to get a fresh NativeSceneView (meshes,
 * blend buffers, a context-loss listener) that was destroyed when it expired. A retired view is
 * parked hidden instead and handed to the next particle: particles of the same emitter share
 * leaf keys, so its meshes and group buffers are reused as they are.
 *
 * `views` holds rendered effects (key → view); off-screen effects retain their caller-owned
 * clocks and need no meshes. Call `show` for every live particle, then `sweep` each frame.
 */
export class NativeEffectViews {
  readonly views = new Map<string, NativeSceneView>();
  private spare: { prefix: string; view: NativeSceneView }[] = [];
  private prefixes = new WeakMap<NativeSceneView, string>();
  private shown = new Set<string>();
  private data = new Map<string, unknown>();
  constructor(
    private scene: Phaser.Scene,
    private prefix: string,
    /** `setData` name carrying `{ key, emitter, ...extra }` on every object of the effect. */
    private dataName: string,
  ) {}
  private acquire(prefix: string) {
    // Views are prefix-bound (texture keys); only reuse views of the same art.
    const index = this.spare.findIndex((entry) => entry.prefix === prefix);
    if (index >= 0) return this.spare.splice(index, 1)[0].view;
    const view = effectSceneView(this.scene, prefix);
    this.prefixes.set(view, prefix);
    return view;
  }
  private park(view: NativeSceneView) {
    if (this.spare.length >= SPARE_LIMIT) {
      view.destroy();
      return;
    }
    // Parked objects stay on the display list: hide them and drop their effect tag so
    // display-list scans only find live effects.
    for (const object of view.objects) {
      if (object.visible) object.setVisible(false);
      object.data?.remove(this.dataName);
    }
    this.spare.push({ prefix: this.prefixes.get(view) ?? this.prefix, view });
  }
  /** Renders one particle; `extra` fields join `{ key, emitter }` in its object data. */
  show(
    fx: Pick<NativeParticlePose, 'key' | 'emitter' | 'poses' | 'x' | 'y' | 'depth'>,
    extra?: Record<string, unknown>,
    prefix = this.prefix,
  ) {
    this.shown.add(fx.key);
    // Phaser exposes rotation at runtime but omits it from this version's camera types.
    const camera = this.scene.cameras?.main as
      (Phaser.Cameras.Scene2D.Camera & { rotation?: number }) | undefined;
    const viewport = camera?.worldView;
    const onScreen =
      viewport &&
      Math.abs(fx.x - viewport.centerX) <= viewport.width / 2 &&
      Math.abs(fx.y - viewport.centerY) <= viewport.height / 2;
    // Phaser refreshes worldView at preRender. A pan/zoom since then must not use stale
    // bounds. Rotated cameras and Phaser's own random shake conservatively keep effects.
    const settled =
      !onScreen &&
      camera &&
      viewport &&
      camera.rotation === 0 &&
      !camera.shakeEffect.isRunning &&
      Math.abs(camera.scrollX + camera.width / 2 - viewport.centerX) < 1e-6 &&
      Math.abs(camera.scrollY + camera.height / 2 - viewport.centerY) < 1e-6 &&
      Math.abs(camera.width / camera.zoomX - viewport.width) < 1e-6 &&
      Math.abs(camera.height / camera.zoomY - viewport.height) < 1e-6;
    if (!onScreen && settled) {
      // Preserve two physical pixels of filtering and everything a custom shake may expose.
      const zoom = Math.min(Math.abs(camera.zoomX), Math.abs(camera.zoomY));
      const padding = Math.max(1, 2 / zoom) + cameraShakePadding(camera);
      if (!nativeEffectInView(fx.poses, fx.x, fx.y, viewport, padding)) {
        const hidden = this.views.get(fx.key);
        if (hidden) {
          this.views.delete(fx.key);
          this.data.delete(fx.key);
          this.park(hidden);
        }
        return;
      }
    }
    let view = this.views.get(fx.key);
    if (!view) this.views.set(fx.key, (view = this.acquire(prefix)));
    view.render(fx.poses, fx.x, fx.y, fx.depth);
    // One data object per effect key, attached only to objects that do not carry it yet.
    let value = this.data.get(fx.key);
    if (!value) this.data.set(fx.key, (value = { key: fx.key, emitter: fx.emitter, ...extra }));
    for (const object of view.objects)
      if (object.getData(this.dataName) !== value) object.setData(this.dataName, value);
  }
  /** True when `show` ran for this key since the last sweep. */
  has(key: string) {
    return this.shown.has(key);
  }
  /** Parks every effect that was not shown since the previous sweep. */
  sweep() {
    for (const [key, view] of this.views)
      if (!this.shown.has(key)) {
        this.views.delete(key);
        this.data.delete(key);
        this.park(view);
      }
    this.shown.clear();
  }
  clear() {
    for (const view of this.views.values()) view.destroy();
    for (const { view } of this.spare) view.destroy();
    this.views.clear();
    this.spare = [];
    this.shown.clear();
    this.data.clear();
  }
}
