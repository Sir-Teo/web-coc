import { isPetUnitKind } from './native-units';
import type Phaser from 'phaser';
import { TROOPS, type TroopKind } from './data';
import type { Battle } from './model';
import { nativeScenePoses, type NativeMeshGraph } from './native-mesh';
import { nativeMeshTexture } from './native-mesh-scene';
import { NativeSceneView } from './native-scene-view';
interface State {
  scene: string;
  exports: string[];
  scale: number;
  actionFrame: number;
  loop: boolean;
}
interface Pack {
  levels: { level: number; states: Record<string, State> }[];
  scenes: Record<string, NativeMeshGraph>;
}
/** Source direction roots and native clip timing follow the deterministic battle clock. */
// Viewport culling skips mesh work for off-screen units; LOD keeps central
// units on meshes and leaves distant units on the cheap sprite fallback.
const CULL_MARGIN = 300;
const CULL_MARGIN_KEPT = 420;
const LOD_UNIT_THRESHOLD = 100;
const LOD_RADIUS_FRACTION = 0.45;
const LOD_RADIUS_MIN = 480;
const LOD_HYSTERESIS = 1.25;
export class TroopNativePresentation {
  private packs = new Map<string, Pack>();
  private pending = new Set<string>();
  private views = new Map<number, { scene: string; view: NativeSceneView }>();
  private positions = new Map<number, { x: number; y: number; dx: number; dy: number }>();
  private alive = true;
  constructor(private scene: Phaser.Scene) {}
  private async load(kind: string) {
    if (this.pending.has(kind)) return;
    this.pending.add(kind);
    try {
      const response = await fetch(`/assets/troops-native/${kind}/graph.json`);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as Pack;
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, g]) =>
          Object.entries(g.textures).map(async ([id, t]) => {
            const key = nativeMeshTexture(`troop:${kind}:${name}`, id);
            if (this.scene.textures.exists(key)) return;
            const image = new Image();
            image.src = '/' + t.path;
            await image.decode();
            if (this.alive && !this.scene.textures.exists(key))
              this.scene.textures.addImage(key, image);
          }),
        ),
      );
      if (this.alive) this.packs.set(kind, pack);
    } catch (error) {
      console.error('Native troop animation', kind, error);
    }
  }
  clear() {
    for (const { view } of this.views.values()) view.destroy();
    this.views.clear();
    this.positions.clear();
  }
  destroy() {
    this.alive = false;
    this.clear();
  }
  render(
    battle: Battle | null,
    reduced: boolean,
    iso: (x: number, y: number) => { x: number; y: number },
    lift: number,
    sprites: Map<number, Phaser.GameObjects.Image>,
  ) {
    const wanted = new Set<number>();
    const alive = new Set<number>();
    const cam = this.scene.cameras?.main as
      | { worldView?: { centerX: number; centerY: number; width: number; height: number } }
      | undefined;
    const view = cam?.worldView;
    const culling = !!view;
    const cx = view?.centerX ?? 0;
    const cy = view?.centerY ?? 0;
    const hw = (view?.width ?? 0) / 2;
    const hh = (view?.height ?? 0) / 2;
    const total = battle?.units.length ?? 0;
    const lodActive = culling && total > LOD_UNIT_THRESHOLD;
    const lodRadius = lodActive
      ? Math.max(LOD_RADIUS_MIN, Math.min(view!.width, view!.height) * LOD_RADIUS_FRACTION)
      : 0;
    for (const u of battle?.units ?? []) {
      if (u.hero || isPetUnitKind(u.kind) || u.ejected) continue;
      alive.add(u.id);
      // Cull before pack fetch/decode so off-screen families never start loading.
      const early = iso(u.x, u.y);
      if (culling) {
        const margin = this.views.has(u.id) ? CULL_MARGIN_KEPT : CULL_MARGIN;
        if (Math.abs(early.x - cx) > hw + margin || Math.abs(early.y - cy) > hh + margin) {
          sprites.get(u.id)?.setVisible(true);
          continue;
        }
        if (lodActive) {
          const dx = early.x - cx;
          const dy = early.y - cy;
          const radius = lodRadius * (this.views.has(u.id) ? LOD_HYSTERESIS : 1);
          if (dx * dx + dy * dy > radius * radius) {
            sprites.get(u.id)?.setVisible(true);
            continue;
          }
        }
      }
      const pack = this.packs.get(u.kind);
      if (!pack) {
        void this.load(u.kind);
        continue;
      }
      const level = pack.levels.find(
        (row) => row.level === (u.level ?? battle!.troopLevels?.[u.kind as TroopKind] ?? 1),
      );
      if (!level) continue;
      const old = this.positions.get(u.id);
      const dx = u.x - (old?.x ?? u.x),
        dy = u.y - (old?.y ?? u.y),
        moving = Math.abs(dx) + Math.abs(dy) > 0.00001;
      const target = battle!.buildings.find((b) => b.id === u.target);
      const facing =
        u.attacking && target
          ? { dx: target.x + 1 - u.x, dy: target.y + 1 - u.y }
          : moving
            ? { dx, dy }
            : (old ?? { dx: 1, dy: 0 });
      this.positions.set(u.id, { x: u.x, y: u.y, dx: facing.dx, dy: facing.dy });
      const requested = u.hp <= 0 ? 'die' : u.attacking ? 'attack' : moving ? 'walk' : 'idle';
      const state = level.states[requested] ?? level.states.idle ?? level.states.walk;
      if (!state) continue;
      const deathAge = battle!.elapsed - (u.defeatedAt ?? battle!.elapsed);
      if (u.hp <= 0 && deathAge > 1.5) {
        sprites.get(u.id)?.setVisible(false);
        continue;
      }
      const sx = facing.dx - facing.dy,
        sy = (facing.dx + facing.dy) / 2,
        slope = sy / Math.max(1e-9, Math.abs(sx));
      const bucket =
        state.exports.length === 3
          ? slope < -0.414
            ? 0
            : slope > 0.414
              ? 2
              : 1
          : Math.min(
              state.exports.length - 1,
              Math.floor(
                ((Math.atan2(sy, Math.abs(sx)) + Math.PI / 2) / Math.PI) * state.exports.length,
              ),
            );
      const name = state.exports[bucket],
        graph = pack.scenes[state.scene],
        clip = graph.clips[graph.exports[name]];
      let seconds = reduced
        ? 0
        : u.hp <= 0
          ? deathAge
          : u.attacking
            ? Math.max(0, TROOPS[u.kind].rate - u.cooldown)
            : battle!.elapsed;
      if (!state.loop && clip) seconds = Math.min(seconds, (clip.timeline.length - 1) / clip.fps);
      const scale = 0.6 * state.scale * ((u.shrink?.until ?? 0) > battle!.elapsed ? 0.5 : 1);
      const poses = nativeScenePoses(graph, name, seconds, {}, [
        scale * (sx < 0 ? -1 : 1),
        0,
        0,
        0,
        scale,
        0,
      ]);
      let owned = this.views.get(u.id);
      if (owned && owned.scene !== state.scene) {
        owned.view.destroy();
        this.views.delete(u.id);
        owned = undefined;
      }
      if (!owned) {
        owned = {
          scene: state.scene,
          view: new NativeSceneView(this.scene, `troop:${u.kind}:${state.scene}`),
        };
        this.views.set(u.id, owned);
      }
      wanted.add(u.id);
      sprites.get(u.id)?.setVisible(false);
      const point = early,
        air = TROOPS[u.kind].flying;
      owned.view.render(
        poses,
        point.x,
        point.y - (air ? lift : 0),
        air ? 7500 : point.y + 1,
        (u.hp <= 0 ? Math.max(0, 1 - deathAge / 1.5) : 1) *
          ((u.native?.effects?.invisibleUntil ?? 0) > battle!.elapsed ? 0.35 : 1),
      );
      for (const object of owned.view.objects) object.setData('nativeTroop', u.id);
    }
    for (const [id, { view }] of this.views)
      if (!wanted.has(id)) {
        view.destroy();
        this.views.delete(id);
      }
    for (const id of this.positions.keys()) if (!alive.has(id)) this.positions.delete(id);
  }
}
