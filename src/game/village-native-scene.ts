import type Phaser from 'phaser';
import { BUILDINGS, type BuildingKind } from './data';
import type { Building, Battle } from './model';
import { NativeSceneView } from './native-scene-view';
import { nativeMeshTexture } from './native-mesh-scene';
import {
  nativeScenePoses,
  type NativeMeshGraph,
  type NativeScenePose,
  type NativeMatrix,
} from './native-mesh';
import progression from '../../reference/full-client/progression.json';
import index from '../../reference/full-client/village-art.json';

interface Reference {
  scene: string;
  export: string;
}
interface Pack {
  levels: { level: number; refs: Record<string, Reference> }[];
  scenes: Record<string, NativeMeshGraph>;
}
export const hasVillageNativeArt = (kind: string) => Object.hasOwn(index.buildings, kind);

/** Source timelines are fetched only for families actually visible in the village or battle. */
export class VillageNativePresentation {
  private packs = new Map<string, Pack>();
  private pending = new Set<string>();
  private views = new Map<string, NativeSceneView>();
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
  private async load(kind: BuildingKind) {
    if (this.pending.has(kind) || this.packs.has(kind)) return;
    this.pending.add(kind);
    try {
      const response = await fetch(`/assets/village-native/${kind}/graph.json`);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const pack = (await response.json()) as Pack;
      await Promise.all(
        Object.entries(pack.scenes).flatMap(([name, graph]) =>
          Object.entries(graph.textures).map(async ([id, texture]) => {
            const key = nativeMeshTexture(`village:${kind}:${name}`, id);
            if (this.scene.textures.exists(key)) return;
            const image = new Image();
            image.src = '/' + texture.path;
            await image.decode();
            if (this.alive && !this.scene.textures.exists(key))
              this.scene.textures.addImage(key, image);
          }),
        ),
      );
      if (this.alive) this.packs.set(kind, pack);
    } catch (error) {
      if (this.alive)
        this.notify(`Could not load ${BUILDINGS[kind].name} animation. Refresh to retry.`);
      console.error('Native village artwork', kind, error);
    }
  }
  clear() {
    for (const view of this.views.values()) view.destroy();
    this.views.clear();
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
    for (const b of [...buildings, ...(this.placement ? [this.placement.building] : [])]) {
      if (!hasVillageNativeArt(b.kind) || b.npc) continue;
      const pack = this.packs.get(b.kind);
      if (!pack) {
        void this.load(b.kind);
        continue;
      }
      const level = pack.levels.find((row) => row.level === b.level);
      if (!level) continue;
      const trap = battle?.traps[b.id];
      const fields =
        b.hp <= 0
          ? ['ExportNameDamaged']
          : trap?.resolved
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
      const root: NativeMatrix = [1.2, 0, 0, 0, 1.2, -32 * BUILDINGS[b.kind].size];
      const poses = new Map<string, NativeScenePose[]>();
      for (const field of fields) {
        const ref = level.refs[field];
        if (!ref) continue;
        const clock =
          field === 'ExportNameBase' ||
          field === 'ExportNameDamaged' ||
          field === 'ExportNameBroken'
            ? 0
            : trap
              ? Math.max(0, seconds - trap.activatedAt)
              : seconds;
        const graph = pack.scenes[ref.scene];
        let fraction = 0;
        if (b.kind === 'goldstorage' || b.kind === 'elixirstorage')
          fraction = this.storageFill(b.kind === 'goldstorage' ? 'gold' : 'elixir');
        else
          fraction =
            b.stored /
            Math.max(1, progression.buildings[b.kind].levels[b.level - 1]?.productionCapacity ?? 1);
        const controls: Record<string, number> = {};
        for (const clip of Object.values(graph.clips))
          for (const [slot, name] of clip.names.entries())
            if (name === 'resource') {
              const frames = graph.clips[clip.children[slot]]?.timeline.length ?? 1;
              controls.resource = Math.round(Math.max(0, Math.min(1, fraction)) * (frames - 1));
            }
        const source = nativeScenePoses(graph, ref.export, clock, controls, root);
        if (b.id === -1 && !this.placement?.valid)
          for (const pose of source)
            pose.multiply = pose.multiply.map((v, channel) =>
              channel === 1 || channel === 2 ? v * 0.45 : v,
            );
        poses.set(ref.scene, [...(poses.get(ref.scene) ?? []), ...source]);
      }
      if (!poses.size) continue;
      sprites.get(b.id)?.setVisible(false);
      const point = iso(b.x + BUILDINGS[b.kind].size / 2, b.y + BUILDINGS[b.kind].size / 2);
      let order = 0;
      for (const [name, source] of poses) {
        const key = `${b.id}:${b.kind}:${name}`;
        wanted.add(key);
        let view = this.views.get(key);
        if (!view)
          this.views.set(
            key,
            (view = new NativeSceneView(this.scene, `village:${b.kind}:${name}`)),
          );
        view.render(
          source,
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
