import type Phaser from 'phaser';
import { BUILDINGS, type BuildingKind, sourceKind } from './data';
import type { Building, Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { nativeMeshTexture } from './native-mesh-scene';
import {
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeScenePose,
  type NativeMatrix,
} from './native-mesh';
import { hasNativeDefenseBody, nativeDefenseBody } from './native-defense-poses';
import { nativeTrapValues } from './native-traps';
import progressionSource from '../../reference/full-client/progression.json';
const progression = progressionSource as unknown as {
  buildings: Record<string, (typeof progressionSource.buildings)['townhall']>;
};
import index from '../../reference/full-client/village-art.json';

interface Reference {
  scene: string;
  export: string;
}
interface Pack {
  levels: { level: number; refs: Record<string, Reference> }[];
  scenes: Record<string, NativeMeshGraph>;
}
type Point = { x: number; y: number };
const packs = index.buildings as unknown as Record<
  string,
  { path: string; variants?: Record<string, { path: string }> }
>;
export const hasVillageNativeArt = (kind: string) => Object.hasOwn(packs, sourceKind(kind));
/** Pack key of one building family, or of one of its per-level battle-mode variant packs. */
const packKey = (kind: string, variant?: string) =>
  variant ? `${sourceKind(kind)}/${variant}` : sourceKind(kind);
const packPath = (kind: string, variant?: string) =>
  variant ? packs[sourceKind(kind)]?.variants?.[variant]?.path : packs[sourceKind(kind)]?.path;

/** Source timelines are fetched only for families actually visible in the village or battle. */
export class VillageNativePresentation {
  private packs = new Map<string, Pack>();
  private pending = new Set<string>();
  private views = new Map<string, NativeSceneView>();
  private aims = new Map<number, Point>();
  private alive = true;
  private placement?: { building: Building; valid: boolean };
  preview(building?: Building, valid = true) {
    this.placement =
      building && hasVillageNativeArt(building.kind)
        ? { building: { ...building, id: -1 }, valid }
        : undefined;
    return !!building && this.packs.has(building.kind);
  }
  constructor(
    private scene: Phaser.Scene,
    private notify: (message: string) => void,
    private storageFill: (resource: 'gold' | 'elixir') => number,
  ) {}
  private async load(kind: BuildingKind | string, variant?: string) {
    const key = packKey(kind, variant);
    const path = packPath(kind, variant);
    if (!path || this.pending.has(key) || this.packs.has(key)) return;
    this.pending.add(key);
    try {
      const response = await fetch('/' + path);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as Pack;
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, graph]) =>
          Object.entries(graph.textures).map(async ([id, texture]) => {
            const textureKey = nativeMeshTexture(`village:${key}:${name}`, id);
            if (this.scene.textures.exists(textureKey)) return;
            const image = new Image();
            image.src = '/' + texture.path;
            await image.decode();
            if (this.alive && !this.scene.textures.exists(textureKey))
              this.scene.textures.addImage(textureKey, image);
          }),
        ),
      );
      if (this.alive) this.packs.set(key, pack);
    } catch (error) {
      if (this.alive && !variant)
        this.notify(
          `Could not load ${BUILDINGS[kind as BuildingKind].name} animation. Refresh to retry.`,
        );
      console.error('Native village artwork', key, error);
    }
  }
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
    this.aims.clear();
  }
  destroy() {
    this.alive = false;
    this.clear();
  }
  render(
    buildings: Building[],
    battle: Battle | null | undefined,
    seconds: number,
    iso: (x: number, y: number) => { x: number; y: number },
    sprites: Map<number, Phaser.GameObjects.Image>,
  ) {
    const wanted = new Set<string>();
    const cam = (this.scene as unknown as { cameras?: { main?: { worldView?: { centerX: number; centerY: number; width: number; height: number } } } }).cameras?.main;
    const camView = cam?.worldView;
    const cx = camView?.centerX ?? 0;
    const cy = camView?.centerY ?? 0;
    const hw = (camView?.width ?? 0) / 2;
    const hh = (camView?.height ?? 0) / 2;
    for (const b of [...buildings, ...(this.placement ? [this.placement.building] : [])]) {
      if (!hasVillageNativeArt(b.kind) || b.npc) continue;
      // Viewport cull before pose sampling; retain hidden views so scrolling
      // back never reallocates their RenderTextures.
      const earlyPoint = iso(b.x + BUILDINGS[b.kind].size / 2, b.y + BUILDINGS[b.kind].size / 2);
      if (camView && b.id !== -1) {
        const margin = 450;
        if (Math.abs(earlyPoint.x - cx) > hw + margin || Math.abs(earlyPoint.y - cy) > hh + margin) {
          const prefix = `${b.id}:`;
          for (const [key, existing] of this.views)
            if (key.startsWith(prefix)) {
              wanted.add(key);
              for (const object of existing.objects) object.setVisible(false);
            }
          sprites.get(b.id)?.setVisible(true);
          continue;
        }
      }
      const pack = this.packs.get(b.kind);
      if (!pack) {
        void this.load(b.kind);
        continue;
      }
      const level = pack.levels.find((row) => row.level === b.level);
      if (!level) continue;
      const trap = battle?.traps[b.id];
      // A resolved Tornado Trap keeps playing its triggered swirl for the spell's own duration.
      const spinning =
        b.kind === 'tornadotrap' &&
        trap &&
        seconds - trap.activatedAt < nativeTrapValues(b.kind, b.level).duration;
      const fields =
        b.hp <= 0
          ? ['ExportNameDamaged']
          : trap?.resolved && !spinning
            ? ['ExportNameBroken']
            : trap
              ? ['ExportNameTriggered']
              : b.constructing
                ? ['ExportNameBase', 'ExportNameConstruction']
                : [
                    'ExportNameBase',
                    'ExportName',
                    ...(b.upgradeEnd ? ['ExportNameBuildAnim'] : []),
                  ];
      // Battle bodies (turret aim, attack, activation and mode) of the Town Hall 11-18 defenses.
      const source = (field: string, variant?: string) => {
        const from = variant ? this.packs.get(packKey(b.kind, variant)) : pack;
        if (!from) {
          if (variant) void this.load(b.kind, variant);
          return undefined;
        }
        const ref = (from.levels.find((row) => row.level === b.level) ?? from.levels[0])?.refs[
          field
        ];
        const graph = ref ? from.scenes[ref.scene] : undefined;
        return ref && graph ? { ref, graph, variant } : undefined;
      };
      const body =
        !b.constructing && b.hp > 0 && !trap && hasNativeDefenseBody(b.kind)
          ? nativeDefenseBody(
              b,
              battle ?? null,
              seconds,
              (field, variant) => {
                const found = source(field, variant);
                return found ? { graph: found.graph, export: found.ref.export } : undefined;
              },
              { actionFrame: (level as { action?: number }).action, lastAim: this.aims.get(b.id) },
            )
          : undefined;
      if (body?.aim && b.id !== -1) this.aims.set(b.id, body.aim);
      const root: NativeMatrix = [1.2, 0, 0, 0, 1.2, -32 * BUILDINGS[b.kind].size];
      const poses = new Map<string, { prefix: string; poses: NativeScenePose[] }>();
      for (const field of fields) {
        const selected =
          field === 'ExportName' && body?.field ? source(body.field, body.variant) : source(field);
        if (!selected) continue;
        const { ref, graph, variant } = selected;
        const clock =
          field === 'ExportNameBase' ||
          field === 'ExportNameDamaged' ||
          field === 'ExportNameBroken'
            ? 0
            : field === 'ExportName' && body?.clock !== undefined
              ? body.clock
              : trap
                ? Math.max(0, seconds - trap.activatedAt)
                : seconds;
        let fraction = 0;
        if (b.kind === 'goldstorage' || b.kind === 'elixirstorage')
          fraction = this.storageFill(b.kind === 'goldstorage' ? 'gold' : 'elixir');
        else
          fraction =
            b.stored /
            Math.max(1, progression.buildings[b.kind].levels[b.level - 1]?.productionCapacity ?? 1);
        const controls: Record<string, number | false> =
          field === 'ExportName' && body ? { ...body.controls } : {};
        for (const clip of Object.values(graph.clips))
          for (const [slot, name] of clip.names.entries())
            if (name === 'resource') {
              const frames = graph.clips[clip.children[slot]]?.timeline.length ?? 1;
              controls.resource = Math.round(Math.max(0, Math.min(1, fraction)) * (frames - 1));
            }
        const source_ = nativeScenePoses(graph, ref.export, clock, controls, root);
        if (b.id === -1 && !this.placement?.valid)
          for (const pose of source_)
            pose.multiply = pose.multiply.map((v, channel) =>
              channel === 1 || channel === 2 ? v * 0.45 : v,
            );
        const key = `${packKey(b.kind, variant)}:${ref.scene}`;
        const entry = poses.get(key) ?? {
          prefix: `village:${packKey(b.kind, variant)}:${ref.scene}`,
          poses: [],
        };
        entry.poses.push(...source_);
        poses.set(key, entry);
      }
      if (!poses.size) continue;
      sprites.get(b.id)?.setVisible(false);
      const point = earlyPoint;
      let order = 0;
      for (const [name, entry] of poses) {
        const key = `${b.id}:${b.kind}:${name}`;
        wanted.add(key);
        let view = this.views.get(key);
        if (!view) this.views.set(key, (view = new NativeSceneView(this.scene, entry.prefix)));
        view.render(
          entry.poses,
          point.x,
          point.y,
          b.id === -1 ? 6000 + order++ * 0.01 : point.y + order++ * 0.01,
          b.id === -1 ? 0.72 : b.constructing ? 0.8 : 1,
        );
        for (const object of view.objects) object.setData('nativeVillage', b.id);
      }
    }
    for (const [key, view] of this.views)
      if (!wanted.has(key)) {
        view.destroy();
        this.views.delete(key);
      }
  }
}
