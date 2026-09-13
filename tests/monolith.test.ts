import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import combat from '../reference/monolith/combat.json';
import catalog from '../reference/monolith/catalog.json';
import runtime from '../reference/monolith/runtime.json';
import {
  MONOLITH,
  MONOLITH_PROJECTILES,
  monolithBaseDamage,
  monolithBonusDamage,
  monolithVariant,
} from '../src/game/monolith-stats';
import { MONOLITH_ART, monolithAsset } from '../src/game/monolith-art';
import { monolithDestroyed } from '../src/game/monolith';
import { NATIVE_COMBAT } from '../src/game/native-campaign';
import type { SpellTowerCast } from '../src/game/spell-tower';
import {
  attacker,
  isolatedBattle,
  lateBuilding,
  stepFamilies,
} from './fixtures/late-defense-battle';

describe('Monolith source records', () => {
  it('retains the pinned level, weapon and projectile values', () => {
    expect(combat.globalId).toBe(1000077);
    expect(combat.levels.map((v) => [v.hp, v.dps, v.damagePermilHp, v.variantThresholds])).toEqual([
      [4747, 150, 110, [600, 2500]],
      [5050, 175, 120, [650, 2750]],
      [5353, 193, 130, [700, 3000]],
      [5656, 209, 140, [750, 3250]],
      [5959, 225, 150, [800, 3500]],
    ]);
    expect(combat.levels.map((v) => v.hp)).toEqual(NATIVE_COMBAT[1000077].hp);
    expect(combat.levels.every((v) => v.defaultVariant === 3 && v.base === 'dark_tower_base')).toBe(true);
    expect(combat.levels[1]).toMatchObject({
      body: 'monolith_lvl_2',
      upgrade: 'monolith_lvl_2_upgrade',
      ruin: 'destroyedBuilding_3l_base_rockwood',
      attackEffect: 'Monolith Attack',
      hitEffect: 'Explosive Arrow',
    });
    expect([combat.range, combat.attackSpeedMs, combat.coolDownOverrideMs]).toEqual([1100, 1500, 750]);
    expect([combat.animationActionFrame, combat.defenderZ, combat.airTargets, combat.groundTargets]).toEqual([
      5,
      155,
      true,
      true,
    ]);
    expect(MONOLITH).toMatchObject({ range: 11, interval: 1.5, cooldown: 0.75, windup: 0.75 });
    expect(MONOLITH_PROJECTILES.map((p) => [p.name, p.speed, p.scale, p.startHeight, p.tracksTarget])).toEqual([
      ['MonolithProjectileMin', 2200, 100, 220, true],
      ['MonolithProjectileMed', 2200, 150, 220, true],
      ['MonolithProjectileMax', 2200, 200, 220, true],
    ]);
    expect(catalog.sources['sc/buildings_35.sctx']).toBe(
      '35e6392104e55ed6e6b2635da517d0a5df28c947b2a2e34fb39d1550faf88a97',
    );
  });

  it('keeps an intact original scene graph, texture set and registered previews', () => {
    const graph = runtime as unknown as {
      exports: Record<string, number>;
      clips: Record<string, { names: string[]; timeline: number[]; children: number[] }>;
      shapes: Record<string, [number, number[]][]>;
      textures: Record<string, { path: string }>;
    };
    for (const level of combat.levels)
      for (const name of [level.body, level.upgrade, level.base, level.ruin, level.construction, level.buildAnim])
        expect(graph.exports[name], name).toBeTypeOf('number');
    const body = graph.clips[graph.exports.monolith_lvl_2];
    const turret = graph.clips[body.children[body.names.indexOf('turret')]];
    expect(turret.timeline).toHaveLength(360);
    expect(turret.names).toEqual(Array.from({ length: 16 }, (_, i) => `d${i + 1}`));
    for (const id of turret.children)
      expect(graph.clips[id].names.filter(Boolean).sort()).toEqual(['projectile_0', 'projectile_1', 'projectile_2']);
    // Every shape references a shipped texture, and every shipped texture is referenced.
    const used = new Set(Object.values(graph.shapes).flatMap((commands) => commands.map(([t]) => String(t))));
    expect([...used].sort()).toEqual(Object.keys(graph.textures).sort());
    for (const texture of Object.values(graph.textures)) expect(existsSync(`public/${texture.path}`)).toBe(true);
    for (const level of [1, 2, 3, 4, 5]) {
      expect(existsSync(`public${monolithAsset(level)}`)).toBe(true);
      expect(catalog.previews[String(level) as keyof typeof catalog.previews]).toMatchObject({
        width: 360,
        height: 460,
        direction: 45,
      });
    }
    expect([MONOLITH_ART.width, MONOLITH_ART.height]).toEqual([180 * 1.2, 230 * 1.2]);
  });
});

describe('Monolith damage and tiers', () => {
  it('adds a share of maximum hitpoints to DPS over the complete cycle', () => {
    expect(monolithBaseDamage(1)).toBe(225);
    expect(monolithBaseDamage(2)).toBe(262.5);
    expect(monolithBonusDamage(2, 5000)).toBe(600);
    expect(monolithBonusDamage(1, 3000)).toBe(330);
  });
  it('selects the orb tier from the target maximum hitpoints', () => {
    expect([649, 650, 2749, 2750].map((hp) => monolithVariant(2, hp))).toEqual([1, 2, 2, 3]);
    expect([599, 600, 2499, 2500].map((hp) => monolithVariant(1, hp))).toEqual([1, 2, 2, 3]);
    expect(monolithVariant(2)).toBe(3);
  });
});

describe('Monolith combat', () => {
  const tower = () => lateBuilding(1, 'monolith', 20, 20, 2);

  it('releases after the hit timer, repeats each full cycle and strikes with the bonus', () => {
    const battle = isolatedBattle([tower()]);
    const giant = attacker(7, 'giant', 21.5 + 8, 21.5, 1e9, 900);
    battle.units.push(giant);
    for (let i = 0; i < 90; i++) stepFamilies(battle);
    const state = battle.late!.monolith!.towers[1];
    expect(state.shots.map((s) => s.at)).toEqual([0.8, 2.3, 3.8].map((v) => expect.closeTo(v, 9)));
    expect(state.shots.every((s) => s.variant === 2)).toBe(true);
    expect(state.hits.map((h) => h.at - state.shots[h.index - 1].at)).toEqual(
      state.hits.map(() => expect.closeTo(8 / 22, 9)),
    );
    expect(state.hits.every((h) => h.struck)).toBe(true);
    expect(1e9 - giant.hp).toBeCloseTo(3 * (262.5 + 900 * 0.12), 6);
  });

  it('holds its closest target, reaches air units and ignores attackers beyond range', () => {
    const battle = isolatedBattle([tower()]);
    battle.units.push(
      attacker(7, 'dragon', 21.5, 21.5 + 6, 1e9, 3000),
      attacker(8, 'giant', 21.5 - 7, 21.5, 1e9, 900),
      attacker(9, 'giant', 21.5 + 11.2, 21.5, 1e9, 900),
    );
    for (let i = 0; i < 20; i++) stepFamilies(battle);
    const state = battle.late!.monolith!.towers[1];
    expect(state.targetId).toBe(7);
    expect(state.shots[0]).toMatchObject({ targetId: 7, variant: 3, toAir: true });
    // A closer attacker does not steal a retained target.
    battle.units.push(attacker(10, 'giant', 22, 22, 1e9, 400));
    for (let i = 0; i < 40; i++) stepFamilies(battle);
    expect(state.shots.every((s) => s.targetId === 7)).toBe(true);
    expect(battle.units[2].hp).toBe(1e9);
  });

  it('boosts only the base share under defensive Rage', () => {
    const battle = isolatedBattle([tower()]);
    battle.units.push(attacker(7, 'giant', 21.5 + 3, 21.5, 1e9, 1000));
    const cast: SpellTowerCast = {
      index: 1,
      sourceId: 99,
      weapon: 'rage',
      level: 3,
      at: -1,
      deployAt: -0.5,
      fromX: 21.5,
      fromY: 22,
      x: 21.5,
      y: 22,
      targetId: null,
      onDeath: false,
      applied: 60,
    };
    battle.late!.spellTower = { towers: {}, casts: [cast], poisonTick: 1, defenderRage: {}, defenderHidden: {} };
    for (let i = 0; i < 20; i++) stepFamilies(battle);
    expect(1e9 - battle.units[0].hp).toBeCloseTo(262.5 * 1.6 + 120, 6);
  });

  it('pauses its lockout while stunned and resolves released orbs after destruction', () => {
    const battle = isolatedBattle([tower()]);
    const giant = attacker(7, 'giant', 21.5 + 10, 21.5, 1e9, 900);
    battle.units.push(giant);
    for (let i = 0; i < 17; i++) stepFamilies(battle);
    const state = battle.late!.monolith!.towers[1];
    expect(state.shots).toHaveLength(1);
    battle.defenseStuns[1] = battle.elapsed + 1;
    for (let i = 0; i < 20; i++) stepFamilies(battle);
    expect(state.readyAt).toBeCloseTo(0.8 + 0.75 + 1, 9);
    expect(state.shots).toHaveLength(1);
    // The remaining lockout resumes after the stun, then a fresh hit timer runs.
    for (let i = 0; i < 30; i++) stepFamilies(battle);
    expect(state.shots.map((s) => s.at)).toEqual([0.8, 3.3].map((v) => expect.closeTo(v, 9)));
    const b = battle.buildings[0];
    b.hp = 0;
    monolithDestroyed({ battle, dt: 0, phase: 'defenses', effect: () => {}, damageBuilding: () => {} }, b, battle.elapsed);
    const before = giant.hp;
    for (let i = 0; i < 40; i++) stepFamilies(battle);
    expect(state.destroyedAt).toBeCloseTo(battle.elapsed - 2, 9);
    expect(state.shots).toHaveLength(2);
    expect(giant.hp).toBeLessThan(before);
    expect(battle.late!.monolith!.projectiles).toEqual([]);
  });
});
