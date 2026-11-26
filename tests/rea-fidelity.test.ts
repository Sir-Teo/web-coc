import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { leagueLabel, statBarMarkup, statScalar } from '../src/ui/rea-helpers';

describe('REA Clash 18.400.21 UI/UX fidelity invariants', () => {
  it('formats pinned league codes with Clash Roman tier spacing while preserving non-tiered names', () => {
    expect(leagueLabel('Unranked')).toBe('Unranked');
    expect(leagueLabel('Bronze3')).toBe('Bronze III');
    expect(leagueLabel('Silver2')).toBe('Silver II');
    expect(leagueLabel('Silver1')).toBe('Silver I');
    expect(leagueLabel('Gold1')).toBe('Gold I');
    expect(leagueLabel('Masters3')).toBe('Masters III');
    expect(leagueLabel('Champion1')).toBe('Champion I');
    expect(leagueLabel('Legendary')).toBe('Legendary');
  });

  it('parses scalable stat scalars and skips non-scalable durations, ranges, and ramps', () => {
    expect(statScalar('1,600')).toBe(1600);
    expect(statScalar('500/hr')).toBe(500);
    expect(statScalar('10 spaces')).toBe(10);
    expect(statScalar('0.8s')).toBeNull();
    expect(statScalar('9 tiles')).toBeNull();
    expect(statScalar('80 → 210 → 2,100')).toBeNull();
    expect(statScalar('Ground & air')).toBeNull();
  });

  it('builds two-tone Clash stat progress bars with next-level gain previews', () => {
    const mid = statBarMarkup('1,000', '1,500', '4,000');
    expect(mid).toContain('aria-hidden="true"');
    expect(mid).toContain('class="stat-now" style="width:25.0%"');
    expect(mid).toContain('class="stat-gain" style="left:25.0%;width:12.5%"');

    const maxed = statBarMarkup('4,000', undefined, '4,000');
    expect(maxed).toContain('class="stat-now" style="width:100.0%"');
    expect(maxed).not.toContain('stat-gain');

    expect(statBarMarkup('9 tiles', '9 tiles', '9 tiles')).toBe('');
  });

  it('keeps stylesheet invariants intact (Quick Armies flex layout, zero backdrop-filter, touch-safe context-close)', () => {
    const baseCss = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    const reaCss = readFileSync(new URL('../src/ui/rea-fidelity.css', import.meta.url), 'utf8');

    expect(baseCss).toMatch(/\.preset-title,\s*\.raid-record-head\s*\{[^}]*display:\s*flex;/);
    expect(baseCss).not.toMatch(/\.preset-title,\s*\.composition-level\s*\{/);
    expect(reaCss).not.toMatch(/^\s*backdrop-filter\s*:/m);
    expect(reaCss).toMatch(/\.context-close\s*\{[^}]*border:\s*0;/);
    expect(reaCss).toContain('@media (prefers-reduced-motion: reduce)');
    expect(reaCss).toContain('.reduce-motion .resource-bar.resource-bump');
  });
});
