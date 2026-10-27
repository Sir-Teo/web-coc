import source from '../../reference/inferno-dragon/beam.json' with { type: 'json' };
import { BUILDINGS } from './data';
import type { Battle } from './model';
import { buildingIndex, defenderIndex } from './battle-index';
import { unitFrozen, buildingHidden } from './native-status';
import { defenderHidden } from './defender-visibility';
import { lateUnitFrozen } from './late-campaign';
import { nativeUnitStats } from './native-units';
import { infernoGraph } from './inferno-graph';
import { nativeGraphBounds } from './native-effects';
import { nativeScenePoses, type NativeMatrix } from './native-mesh';

const effects = [
  source.character.AttackEffect,
  source.character.AttackEffectLv2,
  source.character.AttackEffectLv3,
] as const;
const effectRows = source.effects as Record<string, Record<string, string>[]>;
const particles = source.particles as Record<string, Record<string, string>[]>;
const profiles = effects.map((name) => {
  const effect = effectRows[name][0];
  const particle = particles[effect.ParticleEmitter][0];
  return {
    effect: name,
    locator: effect.AttachLocator,
    export: particle.ParticleExportName,
    fadeIn: Number(particle.FadeInTime) / 1000,
    endZ: Number(particle.TargetedEndZ),
    width: (Number(particle.StartScale) / 100) * 1.2,
    sound: effect.Sound,
    volume: Number(effect.Volume) / 100,
    pitch: Number(effect.MinPitch) / 100,
  };
});
export const infernoDragonBeamProfile = (stage: number) => profiles[stage];

/** Read-only current beam ownership; stale, frozen, dead and recovering attacks draw no beam. */
export function infernoDragonBeams(battle: Battle | null) {
  if (!battle?.nativeTroopDamageRamp || battle.finished) return [];
  const result: {
    id: number;
    stage: number;
    age: number;
    target: { x: number; y: number };
    air: boolean;
    /** Stable ownership of this stage, including a fresh clock when the target changes. */
    key: string;
    at: number;
  }[] = [];
  const buildings = buildingIndex(battle),
    defenders = defenderIndex(battle);
  for (const unit of battle.units) {
    const ramp = unit.native?.damageRamp;
    if (
      unit.kind !== 'infernodragon' ||
      unit.hp <= 0 ||
      unit.ejected ||
      unit.native?.recalled ||
      !unit.attacking ||
      !ramp ||
      unitFrozen(unit, battle.elapsed) ||
      lateUnitFrozen(unit, battle.elapsed)
    )
      continue;
    const expected = ramp.defender ? unit.defenderTarget : unit.target;
    if (expected !== ramp.targetId) continue;
    let target: { x: number; y: number },
      air = false;
    if (ramp.defender) {
      const d = defenders.get(ramp.targetId);
      if (!d || d.hp <= 0 || d.spawnedAt > battle.elapsed + 1e-9 || defenderHidden(battle, d))
        continue;
      target = { x: d.x, y: d.y };
      air = d.mode === 'air';
    } else {
      const b = buildings.get(ramp.targetId);
      if (!b || b.hp <= 0 || buildingHidden(battle, b)) continue;
      const half = BUILDINGS[b.kind].size / 2;
      target = { x: b.x + half, y: b.y + half };
    }
    const age = Math.max(0, battle.elapsed - ramp.startedAt);
    const times = nativeUnitStats(unit.kind, unit.level ?? battle.troopLevels?.infernodragon ?? 1)
      .damageRamp!.switchAt;
    const stage = age + 1e-9 >= times[1] ? 2 : age + 1e-9 >= times[0] ? 1 : 0;
    result.push({
      id: unit.id,
      stage,
      age,
      target,
      air,
      key: `inferno-dragon:${unit.id}:${ramp.defender ? 'd' : 'b'}:${ramp.targetId}:${ramp.startedAt}:${stage}`,
      at: ramp.startedAt + (stage > 0 ? times[stage - 1] : 0),
    });
  }
  return result;
}

/** Source beam texels stretched along their authored x extent between world-pixel endpoints. */
export function infernoDragonBeamPoses(
  stage: number,
  seconds: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const profile = profiles[stage];
  if (!profile || !Number.isFinite(seconds) || seconds < 0)
    throw Error('Invalid Inferno Dragon beam sample');
  const graph = infernoGraph();
  const bounds = nativeGraphBounds(graph, graph.exports[profile.export]);
  const dx = to.x - from.x,
    dy = to.y - from.y,
    length = Math.hypot(dx, dy);
  if (!bounds || !Number.isFinite(length) || length < 1e-3) return [];
  const along = length / Math.max(1, bounds[2] - bounds[0]);
  const ux = dx / length,
    uy = dy / length;
  const root: NativeMatrix = [
    ux * along,
    -uy * profile.width,
    from.x - ux * along * bounds[0],
    uy * along,
    ux * profile.width,
    from.y - uy * along * bounds[0],
  ];
  return nativeScenePoses(graph, profile.export, seconds, {}, root);
}
