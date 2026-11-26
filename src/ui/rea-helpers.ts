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
  const nowPct = Math.min(100, (now / max) * 100);
  const nextPct = next !== null ? Math.min(100, (next / max) * 100) : nowPct;
  const gainPct = Math.max(0, nextPct - nowPct);
  return `<span class="stat-bar" aria-hidden="true"><i class="stat-now" style="width:${nowPct.toFixed(1)}%"></i>${gainPct > 0.2 ? `<i class="stat-gain" style="left:${nowPct.toFixed(1)}%;width:${gainPct.toFixed(1)}%"></i>` : ''}</span>`;
}
