/** A friendly damage/movement boost; omitted components contribute zero. */
export interface BoostSource {
  until: number;
  damage: number;
  speed?: number;
  attackSpeed?: number;
}
export interface NativeBoost extends BoostSource {
  /** Version 93: each source keeps its own expiry instead of extending a shared maximum. */
  sources?: Record<string, BoostSource>;
}
const EPS = 1e-9;
function strongest(sources: Iterable<BoostSource>, at: number) {
  let result: Required<BoostSource> | undefined;
  for (const source of sources) {
    if (source.until <= at + EPS) continue;
    result ??= { until: at, damage: 0, speed: 0, attackSpeed: 0 };
    result.until = Math.max(result.until, source.until);
    result.damage = Math.max(result.damage, source.damage);
    result.speed = Math.max(result.speed, source.speed ?? 0);
    result.attackSpeed = Math.max(result.attackSpeed, source.attackSpeed ?? 0);
  }
  return result;
}
/** Read-only: paused rendering and delayed hits never mutate the simulation's boost records. */
export function activeBoost(boost: NativeBoost | undefined, at: number): BoostSource | undefined {
  if (!boost || boost.until <= at + EPS) return undefined;
  return boost.sources ? strongest(Object.values(boost.sources), at) : boost;
}
/** Refresh one source, pruning expired sources without prolonging their stronger components. */
export function mergeBoost(
  current: NativeBoost | undefined,
  key: string,
  source: BoostSource,
  at: number,
): NativeBoost {
  const sources: Record<string, BoostSource> = {};
  if (current?.sources) {
    for (const [name, value] of Object.entries(current.sources))
      if (value.until > at + EPS) sources[name] = value;
  } else if (current && current.until > at + EPS) {
    sources.legacy = {
      until: current.until,
      damage: current.damage,
      speed: current.speed ?? 0,
      attackSpeed: current.attackSpeed ?? 0,
    };
  }
  if (source.until > at + EPS) sources[key] = source;
  return {
    ...(strongest(Object.values(sources), at) ?? {
      until: at,
      damage: 0,
      speed: 0,
      attackSpeed: 0,
    }),
    sources,
  };
}
