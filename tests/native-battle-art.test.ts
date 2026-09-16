import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import projectileArt from '../reference/full-client/projectile-art.json';
import effectArt from '../reference/full-client/effect-art.json';
import defenseArt from '../reference/full-client/defense-art.json';
import villageArt from '../reference/full-client/village-art.json';
import { makeBuilding, type Battle, type Building, type Unit } from '../src/game/model';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
import {
  nativeDefenseBody,
  nativeLabels,
  nativeMapAngle,
  nativeNamedChild,
  nativeTurretBands,
  nativeTurretFrame,
  nativeAttackFrame,
  nativeFacingAngle,
  townHallFrame,
} from '../src/game/native-defense-poses';
import {
  nativeDirectionRoot,
  nativeProjectileFlight,
  nativeProjectilePack,
  nativePiercingFlight,
  type NativeProjectileRow,
} from '../src/game/native-projectile-poses';
import {
  nativeBirths,
  nativeEffectDuration,
  nativeEffectPoses,
  nativeEffectRow,
  nativeGraphBounds,
  nativeTrailBirths,
} from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';

const read = (path: string) => JSON.parse(fs.readFileSync('public/' + path, 'utf8'));
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const sha = (path: string) =>
  createHash('sha256')
    .update(fs.readFileSync('public/' + path))
    .digest('hex');

function battleWith(buildings: Building[], units: Unit[] = [], elapsed = 10): Battle {
  return {
    elapsed,
    finished: false,
    buildings,
    units,
    defenseTargets: {},
    defenseStuns: {},
    traps: {},
    nativeDefenses: {},
  } as unknown as Battle;
}
const unitAt = (id: number, x: number, y: number): Unit =>
  ({
    id,
    kind: 'swordsman',
    x,
    y,
    hp: 100,
    maxHp: 100,
    cooldown: 0,
    path: [],
    pathAt: 0,
  }) as unknown as Unit;

describe('native battle art packs', () => {
  it('pins every projectile, effect and defense pack it ships', () => {
    for (const [id, pack] of Object.entries(projectileArt.packs))
      expect(sha(pack.path), id).toBe(pack.sha256);
    for (const [id, pack] of Object.entries(effectArt.packs))
      expect(sha(pack.path), id).toBe(pack.sha256);
    for (const [kind, pack] of Object.entries(defenseArt.kinds))
      expect(sha(pack.path), kind).toBe(pack.sha256);
  });
  it('resolves every referenced projectile row to a loadable flight pack', () => {
    for (const [name, id] of Object.entries(projectileArt.projectiles)) {
      const path = nativeProjectilePack(name);
      expect(path, name).toBe(projectileArt.packs[id as keyof typeof projectileArt.packs].path);
      const pack = read(path!);
      const row = pack.projectiles[name] as NativeProjectileRow;
      expect(row.exports.length, name).toBeGreaterThan(0);
      for (const scene of Object.values(pack.scenes as Record<string, NativeMeshGraph>))
        for (const texture of Object.values(scene.textures))
          expect(fs.existsSync('public/' + texture.path), texture.path).toBe(true);
    }
  });
  it('plays every effect and emitter export the packs declare', () => {
    for (const path of new Set(Object.values(effectArt.packs).map((p) => p.path))) {
      const pack = read(path) as NativeArtPack;
      for (const [name, graph] of Object.entries(pack.scenes))
        for (const exportName of Object.keys(graph.exports))
          expect(
            () => nativeScenePoses(graph, exportName, 0.2),
            `${name}:${exportName}`,
          ).not.toThrow();
    }
  });
});

describe('native projectile flight', () => {
  const pack = read(nativeProjectilePack('Artillery Ammo1')!);
  const shell = pack.projectiles['Artillery Ammo1'] as NativeProjectileRow;
  const scatter = read(nativeProjectilePack('Scattershot Projectile 1')!).projectiles[
    'Scattershot Projectile 1'
  ] as NativeProjectileRow;
  const shot = { fromX: 10, fromY: 10, x: 16, y: 10, launched: 2, impact: 7 };
  it('uses the client fixed travel time and arcs to the declared ballistic height', () => {
    const start = nativeProjectileFlight(shell, shot, 2, { iso, airLift: 46 });
    const middle = nativeProjectileFlight(shell, shot, 4.5, { iso, airLift: 46 });
    const landing = nativeProjectileFlight(shell, shot, 7, { iso, airLift: 46 });
    expect(start.end).toBeCloseTo(7, 6);
    expect(start.t).toBe(0);
    expect(landing.t).toBe(1);
    // Peak altitude is 4 x BallisticHeight x t(1-t) above the interpolated line: 5000 units at t=0.5.
    expect(middle.height).toBeCloseTo(
      0.8 * 200 + (16 - 0.8 * 200) * 0.5 + 4 * 5000 * 0.8 * 0.25,
      6,
    );
    expect(landing.height).toBeCloseTo(16, 6);
    expect(landing.x).toBeCloseTo(iso(16, 10).x, 6);
  });
  it('keeps the launch offset inside the flight and rotates along the projected tangent', () => {
    const near = { ...shot, x: 10.3, y: 10 };
    const flight = nativeProjectileFlight(scatter, near, near.launched, { iso, airLift: 46 });
    expect(flight.ground.x).toBeCloseTo(iso(10, 10).x, 6);
    const level = nativeProjectileFlight(
      { ...scatter, StartHeight: '0', BallisticHeight: '0' },
      { fromX: 0, fromY: 0, x: 4, y: 0, launched: 0, impact: 1 },
      0.5,
      { iso, airLift: 46, targetHeight: 0 },
    );
    expect(level.rotation).toBeCloseTo(Math.atan2(iso(4, 0).y, iso(4, 0).x) - Math.PI / 2, 6);
  });
  it('mirrors numbered direction roots for leftward travel', () => {
    const exports = ['a_1', 'a_2', 'a_3'];
    expect(nativeDirectionRoot(exports, 1, 1)).toEqual({ name: 'a_3', flip: false });
    expect(nativeDirectionRoot(exports, -2, -1)).toEqual({ name: 'a_1', flip: true });
    expect(nativeDirectionRoot(exports, 0, -1).name).toBe('a_1');
    // Travel straight along screen x keeps the level root.
    expect(nativeDirectionRoot(exports, 1, -1).name).toBe('a_2');
    expect(nativeDirectionRoot(['solo'], -3, 0)).toEqual({ name: 'solo', flip: false });
  });
  it('advances Firespitter balls along their line at the client speed', () => {
    const ball = read(nativeProjectilePack('GatlingGunAmmo')!).projectiles
      .GatlingGunAmmo as NativeProjectileRow;
    const shot = { fromX: 5, fromY: 5, dirX: 1, dirY: 0, length: 6, speed: 20, launched: 1 };
    const early = nativePiercingFlight(ball, shot, 1.05, iso);
    const late = nativePiercingFlight(ball, shot, 1.4, iso);
    expect(early.ground.x).toBeCloseTo(iso(5 + 1.7, 5).x, 6);
    expect(late.ground.x).toBeCloseTo(iso(5 + 6, 5).x, 6);
    expect(late.t).toBe(1);
    expect(early.y).toBeCloseTo(early.ground.y - 0.8 * 70, 6);
  });
});

describe('native effect sampling', () => {
  const pack = read(
    effectArt.packs[effectArt.effects['Ancient Hit'] as keyof typeof effectArt.packs].path,
  ) as NativeArtPack;
  it('inherits effect columns from the first row without reusing its emitter', () => {
    const rows = pack.effects['Ancient Hit'];
    expect(nativeEffectRow(rows, 0).ParticleEmitter).toBe('doom_crater');
    expect(nativeEffectRow(rows, 1).ParticleEmitter).toBe('doom_blast_top');
    expect(nativeEffectRow(rows, 1).IsoLayer).toBe('Ground');
  });
  it('emits the declared particle count across the emission time', () => {
    const emitter = { ParticleCount: '4', EmissionTime: '400', MinLife: '500', MaxLife: '500' };
    expect(nativeBirths(emitter, 0, false).map((b) => b.index)).toEqual([0]);
    expect(nativeBirths(emitter, 0.35, false).map((b) => b.index)).toEqual([0, 1, 2, 3]);
    // The first particle is already dead at 0.6 s; the second is still inside its 0.5 s life.
    expect(nativeBirths(emitter, 0.6, false)[0]).toEqual({ index: 1, age: 0.5 });
    expect(nativeBirths(emitter, 1.2, false)).toEqual([]);
    const looping = nativeBirths(emitter, 1.2, true, 1.2);
    expect(looping.length).toBeGreaterThan(0);
    expect(Math.max(...looping.map((b) => b.age))).toBeLessThan(0.5);
  });
  it('draws the Eagle Artillery crater and blast at the impact point', () => {
    const poses = nativeEffectPoses(
      pack,
      { key: 'eagleartillery:1', effect: 'Ancient Hit', at: 4, ground: { x: 100, y: 200 } },
      4.2,
      false,
    );
    expect(poses.length).toBeGreaterThan(0);
    expect(new Set(poses.map((p) => p.emitter))).toEqual(
      new Set(['doom_crater', 'doom_blast_top']),
    );
    for (const pose of poses) expect(pose.scene).toBe('buildings');
    expect(poses.some((p) => p.depth === -870)).toBe(true);
    expect(nativeEffectDuration(pack, 'Ancient Hit')).toBeGreaterThan(2);
  });
  it('stretches targeted beam art between the two projected points', () => {
    const swPath =
      effectArt.packs[
        effectArt.effects['ps_chr_SuperWizard_Attack_01'] as keyof typeof effectArt.packs
      ].path;
    const sw = read(swPath) as NativeArtPack;
    const poses = nativeEffectPoses(
      sw,
      {
        key: 'swt:1',
        effect: 'ps_chr_SuperWizard_Attack_01',
        at: 1,
        ground: { x: 0, y: 0 },
        target: { x: 120, y: -40 },
      },
      1.05,
      false,
    );
    expect(poses.length).toBeGreaterThan(0);
    const graph = sw.scenes.buildings;
    const bounds = nativeGraphBounds(graph, graph.exports.super_wizard_beam)!;
    expect(bounds[2]).toBeGreaterThan(bounds[0]);
    const pose = poses[0].poses[0];
    // The art's source x extent maps onto the beam length, so the far end reaches the target.
    expect('group' in pose ? pose.group.length : 1).toBeGreaterThan(0);
  });
  it('caps trail births to a frame budget while keeping stable indices', () => {
    const emitter = { ParticleCount: '7', EmissionTime: '10', MinLife: '125', MaxLife: '350' };
    const births = nativeTrailBirths(emitter, 0, 2, 1);
    expect(births.length).toBeLessThanOrEqual(97);
    expect(births.at(-1)!.at).toBeLessThanOrEqual(1 + 1e-9);
    const later = nativeTrailBirths(emitter, 0, 2, 1.1);
    const shared = later.find((b) => b.index === births.at(-1)!.index);
    expect(shared?.at).toBeCloseTo(births.at(-1)!.at, 9);
  });
});

describe('native defense bodies', () => {
  const actionFrame = (kind: string, level: number) =>
    (village(kind).levels.find((row) => row.level === level) as { action?: number } | undefined)
      ?.action;
  const village = (kind: string, variant?: string) =>
    read(
      variant
        ? (villageArt.buildings as Record<string, { variants: Record<string, { path: string }> }>)[
            kind
          ].variants[variant].path
        : (villageArt.buildings as Record<string, { path: string }>)[kind].path,
    ) as {
      levels: { level: number; refs: Record<string, { scene: string; export: string }> }[];
      scenes: Record<string, NativeMeshGraph>;
    };
  const resolverFor = (kind: string) => {
    const main = village(kind);
    return (level: number) => (field: string, variant?: string) => {
      const pack = variant ? village(kind, variant) : main;
      const ref = (pack.levels.find((row) => row.level === level) ?? pack.levels[0]).refs[field];
      return ref ? { graph: pack.scenes[ref.scene], export: ref.export } : undefined;
    };
  };
  it('picks the source direction band nearest the map angle', () => {
    const pack = village('scattershot');
    const graph = pack.scenes.buildings;
    const turret = nativeNamedChild(graph, 'ice_breaker_lvl1', 'turret')!;
    const bands = nativeTurretBands(graph, turret);
    expect(bands.length).toBe(24);
    expect(nativeTurretFrame(bands, 0)).toBe(0);
    expect(nativeTurretFrame(bands, 7)).toBe(0);
    expect(nativeTurretFrame(bands, 12)).toBe(bands[1]);
    expect(nativeTurretFrame(bands, 359)).toBe(0);
    expect(nativeMapAngle(0, 1)).toBeCloseTo(90, 6);
    expect(nativeMapAngle(-1, 0)).toBeCloseTo(180, 6);
  });
  it('aims the Scattershot turret and plays its attack frames around the release', () => {
    const tower = makeBuilding(1, 'scattershot', 10, 10, 1);
    const unit = unitAt(7, 20, 11.5);
    const battle = battleWith([tower], [unit], 12);
    battle.nativeDefenses![tower.id] = { clock: 12, readyAt: 13, target: 7, firedAt: 12 };
    const body = nativeDefenseBody(tower, battle, 12, resolverFor('scattershot')(1), {
      actionFrame: actionFrame('scattershot', 1),
    })!;
    expect(actionFrame('scattershot', 1)).toBe(5);
    expect(body.field).toBeUndefined();
    expect(body.aim).toEqual({ x: 20 - 11.5, y: 11.5 - 11.5 });
    expect(body.controls.turret).toBe(0);
    // AnimationActionFrame 5 is one-based: the release sits on source frame four.
    expect(body.controls.d1).toBe(4);
    const later = nativeDefenseBody(
      tower,
      { ...battle, elapsed: 12.2 } as Battle,
      12.2,
      resolverFor('scattershot')(1),
      {
        actionFrame: actionFrame('scattershot', 1),
      },
    )!;
    expect(later.controls.d1).toBeGreaterThan(4);
  });
  it('faces the Firespitter along its saved direction and keeps both sectors together', () => {
    const tower = { ...makeBuilding(2, 'firespitter', 4, 4, 1), direction: 2 };
    const body = nativeDefenseBody(tower, null, 0, resolverFor('firespitter')(1))!;
    expect(nativeFacingAngle(2)).toBe(90);
    expect(body.controls.base_sector).toBe(90);
    expect(body.controls.turret_sector).toBe(90);
    expect(body.controls.turret).toBe(90);
  });
  it('holds the Eagle Artillery dormant, then activates, fires and reloads', () => {
    const tower = makeBuilding(3, 'eagleartillery', 6, 6, 1);
    const resolve = resolverFor('eagleartillery')(1);
    const graph = village('eagleartillery').scenes.buildings;
    const labels = nativeLabels(graph, nativeNamedChild(graph, 'doom_cannon_lvl1', 'turret_load'));
    const dormant = nativeDefenseBody(tower, battleWith([tower]), 5, resolve)!;
    expect(dormant.controls.turret_load).toBeUndefined();
    const battle = battleWith([tower], [], 5);
    battle.nativeDefenses![tower.id] = { clock: 5, readyAt: 9, awakeAt: 8 };
    const waking = nativeDefenseBody(tower, battle, 5, resolve)!;
    expect(waking.controls.turret_load).toBeGreaterThanOrEqual(labels.activating_start);
    expect(waking.controls.turret_load).toBeLessThanOrEqual(labels.activating_end);
    const idle = nativeDefenseBody(tower, { ...battle, elapsed: 9 } as Battle, 9, resolve)!;
    expect(idle.controls.turret_load).toBeGreaterThanOrEqual(labels.battleidle_start);
    expect(idle.controls.turret_load).toBeLessThanOrEqual(labels.battleidle_end);
    battle.nativeDefenses![tower.id] = { clock: 9, readyAt: 19, awakeAt: 8, firedAt: 9, ammo: 5 };
    const firing = nativeDefenseBody(tower, { ...battle, elapsed: 9.02 } as Battle, 9.02, resolve)!;
    expect(firing.controls.turret_load).toBeGreaterThanOrEqual(labels.attack_start);
    expect(firing.controls.turret_load).toBeLessThanOrEqual(labels.attack_end);
    const loading = nativeDefenseBody(tower, { ...battle, elapsed: 12 } as Battle, 12, resolve)!;
    expect(loading.controls.turret_load).toBeGreaterThan(labels.load_start);
    expect(loading.controls.turret_load).toBeLessThan(labels.load_end);
  });
  it('draws Town Hall weapon levels and their source activation segments', () => {
    const graph = village('townhall').scenes.buildings;
    const labels = nativeLabels(graph, graph.exports.town_hall_lvl17_t1);
    const info = { frames: graph.clips[graph.exports.town_hall_lvl17_t1].timeline.length, fps: 30 };
    const tower = { ...makeBuilding(4, 'townhall', 20, 20, 17), weaponLevel: 3 };
    const battle = battleWith([tower], [], 30);
    battle.nativeDefenses![tower.id] = { clock: 30, readyAt: 31 };
    const body = nativeDefenseBody(tower, battle, 30, resolverFor('townhall')(17))!;
    expect(body.field).toBe('Weapon3');
    const deactivated = townHallFrame({ clock: 30, readyAt: 31 }, labels, info, 30, tower);
    expect(deactivated).toBeGreaterThanOrEqual(labels.deactive_idle);
    expect(deactivated).toBeLessThanOrEqual(labels.deactive_end);
    const attacking = townHallFrame(
      { clock: 41, readyAt: 42, awakeAt: 40, firedAt: 41 },
      labels,
      info,
      41.1,
      tower,
    );
    expect(attacking).toBeGreaterThanOrEqual(labels.attack);
    expect(attacking).toBeLessThanOrEqual(labels.attack_end);
    const waking = townHallFrame(
      { clock: 39, readyAt: 40, awakeAt: 40 },
      labels,
      info,
      39.5,
      tower,
    );
    expect(waking).toBeGreaterThanOrEqual(labels.active_start);
    expect(waking).toBeLessThanOrEqual(labels.attack_start);
  });
  it('selects the Multi-Gear cannon body and the Spell Tower mode body', () => {
    const gear = { ...makeBuilding(5, 'multigeartower', 8, 8, 1), gearMode: 'fast' as const };
    const gearBody = nativeDefenseBody(gear, null, 0, resolverFor('multigeartower')(1))!;
    expect(gearBody.field).toBe('AlternateExportName');
    expect(gearBody.variant).toBe('alternate-1');
    const tower = { ...makeBuilding(6, 'spelltower', 9, 9, 4), spellMode: 'earthquake' as const };
    const body = nativeDefenseBody(tower, null, 0, resolverFor('spelltower')(4))!;
    expect(body.field).toBe('Mode:earthquake');
  });
  it('aligns release-driven attack frames before and after the shot', () => {
    expect(nativeAttackFrame({ clock: 4, readyAt: 5, firedAt: 4 }, 4, 20, 24, 6)).toBe(6);
    expect(nativeAttackFrame({ clock: 4, readyAt: 5, firedAt: 4 }, 4.5, 20, 24, 6)).toBe(18);
    expect(nativeAttackFrame({ clock: 4, readyAt: 5, firedAt: 4 }, 5, 20, 24, 6)).toBe(0);
    expect(nativeAttackFrame({ clock: 4.9, readyAt: 6, releaseAt: 5 }, 4.9, 20, 24, 6)).toBeCloseTo(
      3.6,
      6,
    );
  });
});
