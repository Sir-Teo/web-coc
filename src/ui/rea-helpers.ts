/** Display pinned league codes (e.g. "Silver1", "Bronze3") with Clash Roman tier spacing. */
export const leagueLabel = (name: string) =>
  name.replace(/([a-z])([123])$/, (_, prev: string, tier: string) => `${prev} ${'I'.repeat(Number(tier))}`);

export type LeagueTier =
  | 'unranked'
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'crystal'
  | 'master'
  | 'champion'
  | 'titan'
  | 'legend';

/** Map a pinned league name (e.g. "Silver1", "Masters3", "Legendary") to its visual tier key. */
export function leagueTier(name: string): LeagueTier {
  const lower = name.toLowerCase();
  if (lower.startsWith('legend')) return 'legend';
  if (lower.startsWith('titan')) return 'titan';
  if (lower.startsWith('champ')) return 'champion';
  if (lower.startsWith('master')) return 'master';
  if (lower.startsWith('crystal')) return 'crystal';
  if (lower.startsWith('gold')) return 'gold';
  if (lower.startsWith('silver')) return 'silver';
  if (lower.startsWith('bronze')) return 'bronze';
  return 'unranked';
}

/** Parse leading scalar stat values ("1,600", "500/hr", "10 spaces") for Clash info bars. */
export function statScalar(value?: string) {
  if (
    !value ||
    value.includes('→') ||
    value.includes('–') ||
    /(?:\d\s*s\b|\btiles?\b)/i.test(value)
  )
    return null;
  const match = value.match(/^[\s+]*([\d,]+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/** Build Clash-style two-tone horizontal stat progress bar markup (current + next-level gain). */
export function statBarMarkup(
  nowText: string,
  nextText: string | undefined,
  maxText: string | undefined,
) {
  const now = statScalar(nowText),
    max = statScalar(maxText);
  if (now === null || max === null || max <= 0 || now > max) return '';
  const next = nextText ? statScalar(nextText) : null;
  if (next !== null && next < now) return '';
  return numericStatBarMarkup(now, next ?? undefined, max);
}

/** Build a Clash two-tone stat bar directly from numeric values (current, optional next, max). */
export function numericStatBarMarkup(
  now: number,
  next: number | undefined,
  max: number,
) {
  if (!Number.isFinite(now) || !Number.isFinite(max) || max <= 0 || now <= 0 || now > max)
    return '';
  if (next !== undefined && (!Number.isFinite(next) || next < now)) return '';
  const nowPct = Math.min(100, (now / max) * 100);
  const nextPct = next !== undefined ? Math.min(100, (next / max) * 100) : nowPct;
  const gainPct = Math.max(0, nextPct - nowPct);
  return `<span class="stat-bar" aria-hidden="true"><i class="stat-now" style="width:${nowPct.toFixed(1)}%"></i>${gainPct > 0.2 ? `<i class="stat-gain" style="left:${nowPct.toFixed(1)}%;width:${gainPct.toFixed(1)}%"></i>` : ''}</span>`;
}

export interface DeployedArmyEntry {
  category: 'hero' | 'troop' | 'spell';
  kind: string;
  count: number;
  level?: number;
}

/** Collect deployed heroes, troops, and spells for the Battle Result summary strip. */
export function deployedArmySummary(input: {
  heroes: { kind: string; level: number; deployed: boolean }[];
  troops: { kind: string; carried: number; remaining: number }[];
  spells: { kind: string; carried: number; remaining: number }[];
}): DeployedArmyEntry[] {
  const entries: DeployedArmyEntry[] = [];
  for (const h of input.heroes)
    if (h.deployed) entries.push({ category: 'hero', kind: h.kind, count: 1, level: h.level });
  for (const t of input.troops) {
    const used = Math.max(0, t.carried - t.remaining);
    if (used > 0) entries.push({ category: 'troop', kind: t.kind, count: used });
  }
  for (const s of input.spells) {
    const used = Math.max(0, s.carried - s.remaining);
    if (used > 0) entries.push({ category: 'spell', kind: s.kind, count: used });
  }
  return entries;
}

export interface ReplayTimelineMarker {
  pct: number;
  kind: 'troop' | 'spell' | 'hero' | 'ability';
}

/** Project replay deployment/spell/hero actions onto normalized [0..100] timeline markers. */
export function replayTimelineMarkers(
  steps: readonly number[],
  actions: readonly { step: number; type: string }[],
  duration: number,
): ReplayTimelineMarker[] {
  if (!duration || duration <= 0 || !actions.length) return [];
  const elapsedAt: number[] = new Array(steps.length + 1);
  let acc = 0;
  elapsedAt[0] = 0;
  for (let i = 0; i < steps.length; i++) {
    acc += steps[i];
    elapsedAt[i + 1] = acc;
  }
  const markers: ReplayTimelineMarker[] = [];
  let lastTroopPct = -10;
  for (const action of actions) {
    const kind: ReplayTimelineMarker['kind'] | null =
      action.type === 'troop' || action.type === 'recalled-troop'
        ? 'troop'
        : action.type === 'spell'
          ? 'spell'
          : action.type === 'hero'
            ? 'hero'
            : action.type === 'ability'
              ? 'ability'
              : null;
    if (!kind) continue;
    const stepIdx = Math.max(0, Math.min(steps.length, action.step));
    const pct = Math.max(0, Math.min(100, (elapsedAt[stepIdx] / duration) * 100));
    if (kind === 'troop' && pct - lastTroopPct < 1.8) continue;
    if (kind === 'troop') lastTroopPct = pct;
    markers.push({ pct, kind });
  }
  return markers;
}
