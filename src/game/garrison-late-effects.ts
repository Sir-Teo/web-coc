import type { NativeEffectEvent } from './native-effects';
import {
  animationStates,
  characterFacing,
  characterLocator,
  rowExport,
  rowScale,
} from './character-poses';
import { garrisonAura, garrisonDeathSpell, garrisonStats } from './garrison-kinds';
import { visualRandom } from './visual-random';
import type { GarrisonDefender } from './defenders';
import { isGarrisonDefender } from './defenders';
import type { Battle } from './model';

/**
 * Original Electro Dragon chain art with a drawn loading fallback. Death lightning, Titan aura
 * and Witch summon effects retain local shapes until their emitter behavior is imported. Every shape derives from
 * recorded battle state and the battle clock, so replay seeks reproduce it exactly.
 */
export interface LateEffectBolt {
  key: string;
  kind: 'bolt';
  points: { x: number; y: number }[];
  color: number;
  width: number;
  alpha: number;
  depth: number;
}
export interface LateEffectRing {
  key: string;
  kind: 'ring';
  x: number;
  y: number;
  rx: number;
  ry: number;
  color: number;
  width: number;
  alpha: number;
  fill: number;
  depth: number;
}
export type LateEffectShape = LateEffectBolt | LateEffectRing;
type Iso = (x: number, y: number) => { x: number; y: number };

/** Seconds a chain segment, a death bolt, a summon glow and an aura pulse stay visible. */
export const LATE_EFFECT_TIMES = { chain: 0.25, bolt: 0.35, summon: 0.5, pulse: 0.4 } as const;
const BODY_HEIGHT = 16;
const CHAIN_COLOR = 0xbfe8ff;
const SUMMON_COLOR = 0xc67bff;

/** A jagged line with deterministic perpendicular offsets (straight under reduced motion). */
function jagged(
  from: { x: number; y: number },
  to: { x: number; y: number },
  seed: [number, number],
  reduced: boolean,
) {
  const segments = 6;
  const dx = to.x - from.x,
    dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / length,
    ny = dx / length;
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = i / segments;
    const jitter =
      reduced || i === 0 || i === segments
        ? 0
        : (visualRandom(seed[0], seed[1], i) - 0.5) * Math.min(18, length * 0.18);
    return { x: from.x + dx * t + nx * jitter, y: from.y + dy * t + ny * jitter };
  });
}
/** A world circle of `radius` tiles projected to screen axes. */
function ellipse(iso: Iso, radius: number) {
  const origin = iso(0, 0);
  const d = radius / Math.SQRT2;
  return { rx: Math.abs(iso(d, -d).x - origin.x), ry: Math.abs(iso(d, d).y - origin.y) };
}
const fade = (since: number, duration: number) => Math.max(0, 1 - since / duration);

function chainSegments(
  defender: GarrisonDefender,
  iso: Iso,
  lift: number,
  elapsed: number,
  duration: number,
) {
  const segments: { event: NativeEffectEvent; seed: [number, number]; width: number }[] = [];
  const stats = garrisonStats(defender.kind, defender.level);
  const attackRow = animationStates(stats.animation).attack[0];
  const elevate = (x: number, y: number, air: boolean | undefined, height = BODY_HEIGHT) => {
    const point = iso(x, y);
    return { x: point.x, y: point.y - height - (air ? lift : 0) };
  };
  for (const attack of defender.attacks) {
    if (!attack.chain) continue;
    const since = elapsed - attack.at;
    if (since >= 0 && since < duration) {
      // The primary bolt leaves the source `attack_pivot` locator of the attack row's action frame.
      const facing = characterFacing(attack.targetX - attack.x, attack.targetY - attack.y);
      const exportName = rowExport(attackRow, facing.view);
      const frame = Math.max(0, Number(attackRow.ActionFrame || 1) - 1);
      const pivot = characterLocator(
        stats.animation,
        exportName,
        facing.mirror,
        rowScale(attackRow),
        'attack_pivot',
        frame,
      );
      const origin = iso(attack.x, attack.y);
      const from = {
        x: origin.x + (pivot?.x ?? 0),
        y: origin.y + (pivot?.y ?? 0) - (stats.flying ? lift : 0),
      };
      segments.push({
        event: {
          key: `late-chain:${defender.id}:${attack.n}:0`,
          effect: 'Electro Dragon Attack Chain',
          at: attack.at,
          ground: from,
          target: elevate(attack.hitX ?? attack.targetX, attack.hitY ?? attack.targetY, attack.air),
          depth: 7800,
        },
        seed: [defender.id, (attack.n ?? 0) * 8],
        width: 3,
      });
    }
    for (const [index, jump] of attack.chain.entries()) {
      const jumpSince = elapsed - jump.at;
      if (jumpSince < 0 || jumpSince >= duration) continue;
      const previous = index ? attack.chain[index - 1].air : attack.air;
      segments.push({
        event: {
          key: `late-chain:${defender.id}:${attack.n}:${index + 1}`,
          effect: 'Electro Dragon Attack Chain',
          at: jump.at,
          ground: elevate(jump.fromX, jump.fromY, previous),
          target: elevate(jump.x, jump.y, jump.air),
          depth: 7800,
        },
        seed: [defender.id, (attack.n ?? 0) * 8 + index + 1],
        width: 2.5,
      });
    }
  }
  return segments;
}

/** Recorded segment times and attachment points, shared by native art and its loading fallback. */
export function garrisonChainEffects(
  battle: Battle,
  iso: Iso,
  lift: number,
  elapsed: number,
  duration: number,
) {
  return (battle.defenders ?? []).flatMap((defender) =>
    isGarrisonDefender(defender) &&
    battle.elapsed >= defender.spawnedAt &&
    garrisonStats(defender.kind, defender.level).chain
      ? chainSegments(defender, iso, lift, elapsed, duration).map(({ event }) => event)
      : [],
  );
}

function chainShapes(
  defender: GarrisonDefender,
  reduced: boolean,
  iso: Iso,
  lift: number,
  elapsed: number,
): LateEffectShape[] {
  return chainSegments(defender, iso, lift, elapsed, LATE_EFFECT_TIMES.chain).map(
    ({ event, seed, width }) => ({
      key: event.key,
      kind: 'bolt',
      points: jagged(event.ground, event.target!, seed, reduced),
      color: CHAIN_COLOR,
      width,
      alpha: fade(elapsed - event.at, LATE_EFFECT_TIMES.chain),
      depth: 7800,
    }),
  );
}

/**
 * `elapsed` samples the transient shapes (chains, death bolts, summon glows): callers pass the
 * presentation clock so shapes alive at the finish fade out instead of freezing. The aura ring
 * of a living defender is a loop and stays on the battle clock.
 */
export function garrisonLateEffectShapes(
  battle: Battle | null,
  reduced: boolean,
  iso: Iso,
  lift: number,
  elapsed = battle?.elapsed ?? 0,
): LateEffectShape[] {
  const shapes: LateEffectShape[] = [];
  if (!battle) return shapes;
  for (const defender of battle.defenders ?? []) {
    if (!isGarrisonDefender(defender) || battle.elapsed < defender.spawnedAt) continue;
    const stats = garrisonStats(defender.kind, defender.level);
    if (stats.chain) shapes.push(...chainShapes(defender, reduced, iso, lift, elapsed));
    const spell = defender.bolts ? garrisonDeathSpell(stats) : undefined;
    for (const [index, bolt] of (defender.bolts ?? []).entries()) {
      const since = elapsed - bolt.at;
      if (!spell || since < 0 || since >= LATE_EFFECT_TIMES.bolt) continue;
      const ground = iso(bolt.x, bolt.y);
      const alpha = fade(since, LATE_EFFECT_TIMES.bolt);
      shapes.push({
        key: `late-bolt:${defender.id}:${index}`,
        kind: 'bolt',
        points: jagged(
          { x: ground.x, y: ground.y - 220 },
          ground,
          [defender.id, 1000 + index],
          reduced,
        ),
        color: CHAIN_COLOR,
        width: 4,
        alpha,
        depth: 7800,
      });
      shapes.push({
        key: `late-bolt-ring:${defender.id}:${index}`,
        kind: 'ring',
        x: ground.x,
        y: ground.y,
        ...ellipse(iso, spell.radius),
        color: CHAIN_COLOR,
        width: 2,
        alpha: alpha * 0.6,
        fill: alpha * 0.12,
        depth: -837,
      });
    }
    const aura = stats.aura ? garrisonAura(stats) : undefined;
    if (aura && defender.hp > 0) {
      const point = iso(defender.x, defender.y);
      const first = defender.spawnedAt + aura.firstHit;
      const pulses =
        battle.elapsed < first ? -1 : Math.floor((battle.elapsed - first) / aura.interval + 1e-9);
      const since = pulses < 0 ? Infinity : battle.elapsed - (first + pulses * aura.interval);
      const pulse = reduced ? 0 : fade(since, LATE_EFFECT_TIMES.pulse);
      shapes.push({
        key: `late-aura:${defender.id}`,
        kind: 'ring',
        x: point.x,
        y: point.y,
        ...ellipse(iso, aura.radius),
        color: CHAIN_COLOR,
        width: 2,
        alpha: 0.28 + 0.4 * pulse,
        fill: 0.05 + 0.08 * pulse,
        depth: -837,
      });
    }
    for (const event of defender.summon?.events ?? []) {
      const since = elapsed - event.at;
      if (since < 0 || since >= LATE_EFFECT_TIMES.summon) continue;
      const point = iso(defender.x, defender.y);
      const alpha = fade(since, LATE_EFFECT_TIMES.summon);
      shapes.push({
        key: `late-summon:${defender.id}:${event.n}`,
        kind: 'ring',
        x: point.x,
        y: point.y,
        ...ellipse(iso, 1 + since),
        color: SUMMON_COLOR,
        width: 2,
        alpha: alpha * 0.8,
        fill: alpha * 0.18,
        depth: -837,
      });
    }
  }
  return shapes;
}
