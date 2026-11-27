import type { LeagueTier } from './rea-helpers';

const svgCache = new Map<string, string>();

/** Sculpted Clash-style bevelled 5-point star (gold when earned, recessed slate when empty). */
export function clashStarSvg(earned: boolean, size = 22): string {
  const key = `star:${earned ? 1 : 0}:${size}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const uid = earned ? 'csg' : 'cse';
  const fill = earned
    ? `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff8b3"/><stop offset="45%" stop-color="#ffd234"/><stop offset="100%" stop-color="#d67806"/></linearGradient></defs>
       <polygon points="16,2 20.2,10.5 29.6,11.8 22.8,18.4 24.4,27.8 16,23.3 7.6,27.8 9.2,18.4 2.4,11.8 11.8,10.5" fill="url(#${uid})" stroke="#3b1d04" stroke-width="2.1" stroke-linejoin="round"/>
       <polygon points="16,4.6 19.2,11.2 16,15.6 12.8,11.2" fill="#fffde0" opacity="0.72"/>`
    : `<defs><linearGradient id="${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#5d6473"/><stop offset="100%" stop-color="#2c313b"/></linearGradient></defs>
       <polygon points="16,2 20.2,10.5 29.6,11.8 22.8,18.4 24.4,27.8 16,23.3 7.6,27.8 9.2,18.4 2.4,11.8 11.8,10.5" fill="url(#${uid})" stroke="#171b22" stroke-width="2.1" stroke-linejoin="round" opacity="0.88"/>`;
  const markup = `<svg class="clash-star-svg ${earned ? 'earned' : 'empty'}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${fill}</svg>`;
  svgCache.set(key, markup);
  return markup;
}

/** Render a row of Clash sculpted stars (used in Battle HUD, Star Callout, Result, Campaign). */
export function clashStarsMarkup(earned: number, total = 3, size = 22): string {
  const clamped = Math.max(0, Math.min(total, Math.floor(earned)));
  let out = '';
  for (let i = 0; i < total; i++) {
    const isEarned = i < clamped;
    out += `<span class="clash-star ${isEarned ? 'earned' : 'empty'}" style="--star-i:${i}">${clashStarSvg(isEarned, size)}</span>`;
  }
  return out;
}

/** Clash 5-point glossy blue XP star rendered behind the Chief's level number. */
export function xpStarSvg(size = 54): string {
  const key = `xp:${size}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const markup = `<svg class="xp-star-svg" width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="xpg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#7ce4ff"/><stop offset="48%" stop-color="#2494f0"/><stop offset="100%" stop-color="#1149a6"/></linearGradient></defs><polygon points="32,3 40.6,20.5 60,23.2 46,36.8 49.4,56.2 32,47 14.6,56.2 18,36.8 4,23.2 23.4,20.5" fill="url(#xpg)" stroke="#0d2a5c" stroke-width="3.6" stroke-linejoin="round"/><polygon points="32,8 39,22 32,30 25,22" fill="#d4f6ff" opacity="0.58"/></svg>`;
  svgCache.set(key, markup);
  return markup;
}

const LEAGUE_PALETTE: Record<
  LeagueTier,
  { top: string; mid: string; bot: string; rim: string; gem: string; wings?: string }
> = {
  unranked: { top: '#b89b72', mid: '#846843', bot: '#533e23', rim: '#3c2a14', gem: '#d4be98' },
  bronze: { top: '#f2a866', mid: '#b86224', bot: '#6e340c', rim: '#3f1c05', gem: '#ffd19c' },
  silver: { top: '#f3f7fc', mid: '#aeb9c9', bot: '#636f82', rim: '#2d3645', gem: '#ffffff', wings: '#dce6f2' },
  gold: { top: '#fff28c', mid: '#e5a415', bot: '#9c5a04', rim: '#4d2800', gem: '#fff7ba', wings: '#ffe169' },
  crystal: { top: '#f5a9ff', mid: '#a84ce6', bot: '#5c1a96', rim: '#2e0a4f', gem: '#fde0ff', wings: '#d38cff' },
  master: { top: '#58606e', mid: '#262b33', bot: '#12151a', rim: '#f4c13a', gem: '#ffdb66', wings: '#f4c13a' },
  champion: { top: '#ff705e', mid: '#c41d1d', bot: '#6b0a0a', rim: '#ffd152', gem: '#ffe794', wings: '#ffd152' },
  titan: { top: '#fff2a6', mid: '#c9881c', bot: '#4a2906', rim: '#ffe073', gem: '#8df5ff', wings: '#ffe68c' },
  legend: { top: '#d678ff', mid: '#781ecc', bot: '#39096e', rim: '#ffd95e', gem: '#fff2a6', wings: '#ffd95e' },
};

/** Authentic Clash-inspired league shield emblem keyed by pinned league tier. */
export function leagueBadgeSvg(tier: LeagueTier, size = 22): string {
  const key = `league:${tier}:${size}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const p = LEAGUE_PALETTE[tier] ?? LEAGUE_PALETTE.unranked;
  const id = `lg_${tier}`;
  const wings = p.wings
    ? `<path d="M5,11 L1,8 L3,15 L7,17 Z M27,11 L31,8 L29,15 L25,17 Z" fill="${p.wings}" stroke="#231608" stroke-width="1.3" stroke-linejoin="round"/>`
    : '';
  const crown =
    tier === 'legend' || tier === 'titan' || tier === 'champion'
      ? `<polygon points="16,1.5 19,6.5 23.5,4.5 21.5,9 10.5,9 8.5,4.5 13,6.5" fill="#ffd95e" stroke="#3a2004" stroke-width="1.1" stroke-linejoin="round"/>`
      : '';
  const center =
    tier === 'legend'
      ? `<polygon points="16,10.5 17.9,14.3 22,14.9 19,17.8 19.7,21.9 16,19.9 12.3,21.9 13,17.8 10,14.9 14.1,14.3" fill="${p.gem}" stroke="#3a1904" stroke-width="0.9"/>`
      : `<polygon points="16,10 21,16 16,23 11,16" fill="${p.gem}" opacity="0.88"/>`;
  const markup = `<svg class="league-badge-svg tier-${tier}" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${p.top}"/><stop offset="55%" stop-color="${p.mid}"/><stop offset="100%" stop-color="${p.bot}"/></linearGradient></defs>${wings}${crown}<path d="M16,5 L26,8.5 L25,18.5 C24.6,23.5 20.6,27.6 16,29.5 C11.4,27.6 7.4,23.5 7,18.5 L6,8.5 Z" fill="url(#${id})" stroke="${p.rim}" stroke-width="2.2" stroke-linejoin="round"/>${center}</svg>`;
  svgCache.set(key, markup);
  return markup;
}

/** Clash-style Builder helmet & hammer medallion for the top status chip. */
export function builderBadgeSvg(size = 22): string {
  const key = `builder:${size}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const markup = `<svg class="hud-badge-svg builder-badge-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="bhg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c98542"/><stop offset="100%" stop-color="#7a4217"/></linearGradient><linearGradient id="bmg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f5f8fc"/><stop offset="100%" stop-color="#8b99ab"/></linearGradient></defs><rect x="13" y="13" width="5" height="15" rx="2" transform="rotate(-35 15 20)" fill="url(#bhg)" stroke="#2b1707" stroke-width="1.8"/><rect x="7" y="5" width="16" height="8" rx="2.4" transform="rotate(-35 15 9)" fill="url(#bmg)" stroke="#232c38" stroke-width="1.8"/><path d="M10,8 L19,4" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" opacity="0.72"/></svg>`;
  svgCache.set(key, markup);
  return markup;
}

/** Clash-style blue & gold village shield emblem for the top status chip. */
export function shieldBadgeSvg(size = 22): string {
  const key = `shield:${size}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  const markup = `<svg class="hud-badge-svg shield-badge-svg" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="shg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8de7ff"/><stop offset="55%" stop-color="#2894e8"/><stop offset="100%" stop-color="#134891"/></linearGradient></defs><path d="M16,3 L26.5,7.2 L25.6,17.5 C25,23.2 20.8,27.5 16,29.5 C11.2,27.5 7,23.2 6.4,17.5 L5.5,7.2 Z" fill="url(#shg)" stroke="#f6c844" stroke-width="2.4" stroke-linejoin="round"/><path d="M16,5.5 L24,8.7 L23.3,17.2 C22.8,21.5 19.6,25 16,26.8 Z" fill="#ffffff" opacity="0.18"/><path d="M11.5,16.5 L14.8,19.8 L21.2,12.8" fill="none" stroke="#fff8d6" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  svgCache.set(key, markup);
  return markup;
}

/** Faceted Clash resource emblem SVGs (Gold Coin, Elixir Drop, Dark Elixir Drop, Emerald Gem). */
export function resourceEmblemSvg(kind: 'gold' | 'elixir' | 'dark' | 'gem'): string {
  const key = `res:${kind}`;
  const cached = svgCache.get(key);
  if (cached) return cached;
  let markup: string;
  if (kind === 'gold') {
    markup = `<svg class="resource-svg gold" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="rcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#fff49c"/><stop offset="50%" stop-color="#f4b71a"/><stop offset="100%" stop-color="#a86204"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="url(#rcg)" stroke="#4c2903" stroke-width="1.9"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#fff4a8" stroke-width="1.3" opacity="0.82"/><path d="M12,7.2 L13.4,10.6 L16.8,12 L13.4,13.4 L12,16.8 L10.6,13.4 L7.2,12 L10.6,10.6 Z" fill="#fff9cf"/></svg>`;
  } else if (kind === 'elixir') {
    markup = `<svg class="resource-svg elixir" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="reg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffb8ff"/><stop offset="50%" stop-color="#d430e0"/><stop offset="100%" stop-color="#750c82"/></linearGradient></defs><path d="M12,2.2 C12,2.2 19.5,10.4 19.5,15.1 C19.5,19.3 16.1,22 12,22 C7.9,22 4.5,19.3 4.5,15.1 C4.5,10.4 12,2.2 12,2.2 Z" fill="url(#reg)" stroke="#3d0647" stroke-width="1.9" stroke-linejoin="round"/><ellipse cx="9.6" cy="13.8" rx="1.9" ry="3.2" transform="rotate(-18 9.6 13.8)" fill="#ffe0ff" opacity="0.72"/></svg>`;
  } else if (kind === 'dark') {
    markup = `<svg class="resource-svg dark" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="rdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#8b69b5"/><stop offset="48%" stop-color="#35204d"/><stop offset="100%" stop-color="#140b21"/></linearGradient></defs><path d="M12,2.2 C12,2.2 19.5,10.4 19.5,15.1 C19.5,19.3 16.1,22 12,22 C7.9,22 4.5,19.3 4.5,15.1 C4.5,10.4 12,2.2 12,2.2 Z" fill="url(#rdg)" stroke="#0d0617" stroke-width="1.9" stroke-linejoin="round"/><ellipse cx="9.5" cy="13.8" rx="1.8" ry="3.1" transform="rotate(-18 9.5 13.8)" fill="#c7a3ff" opacity="0.68"/></svg>`;
  } else {
    markup = `<svg class="resource-svg gem" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="rgg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#a6ffbe"/><stop offset="52%" stop-color="#22bd55"/><stop offset="100%" stop-color="#0a6b28"/></linearGradient></defs><polygon points="12,2 21,9.5 17.5,21.5 6.5,21.5 3,9.5" fill="url(#rgg)" stroke="#083d17" stroke-width="1.9" stroke-linejoin="round"/><polygon points="12,4.6 17.6,9.5 12,18.8 6.4,9.5" fill="#d4ffe0" opacity="0.45"/></svg>`;
  }
  svgCache.set(key, markup);
  return markup;
}
