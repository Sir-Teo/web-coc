import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildingPortrait } from '../src/ui/building-portrait-art';
import {
  deployedArmySummary,
  leagueLabel,
  leagueTier,
  numericStatBarMarkup,
  replayTimelineMarkers,
  statBarMarkup,
  statScalar,
} from '../src/ui/rea-helpers';

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

  it('maps pinned league names to their visual tier keys', () => {
    expect(leagueTier('Unranked')).toBe('unranked');
    expect(leagueTier('Bronze3')).toBe('bronze');
    expect(leagueTier('Silver1')).toBe('silver');
    expect(leagueTier('Gold2')).toBe('gold');
    expect(leagueTier('Crystal1')).toBe('crystal');
    expect(leagueTier('Masters3')).toBe('master');
    expect(leagueTier('Champion1')).toBe('champion');
    expect(leagueTier('Titan2')).toBe('titan');
    expect(leagueTier('Legendary')).toBe('legend');
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
    expect(reaCss).toContain('.reduce-motion .cloud-veil.parting .cloud-bank');
    expect(reaCss).toContain('.reduce-motion .star-callout.show');
  });

  it('maps Wall levels to native catalog portraits in the HUD while preserving Builder Hut tiers', () => {
    expect(buildingPortrait('wall', 1)).toBe('/assets/catalog-native/wall/level-1.png');
    expect(buildingPortrait('wall', 8)).toBe('/assets/catalog-native/wall/level-8.png');
    expect(buildingPortrait('wall', 19)).toBe('/assets/catalog-native/wall/level-19.png');
    expect(buildingPortrait('builder', 4)).toBe('/assets/catalog-native/builders-hut/level-4.png');
    expect(buildingPortrait('builder', 5)).toBeUndefined();
  });

  it('builds numeric two-tone stat bars and rejects invalid or decreasing inputs', () => {
    const mid = numericStatBarMarkup(200, 260, 1000);
    expect(mid).toContain('width:20.0%');
    expect(mid).toContain('left:20.0%;width:6.0%');

    const capped = numericStatBarMarkup(1000, undefined, 1000);
    expect(capped).toContain('width:100.0%');
    expect(capped).not.toContain('stat-gain');

    expect(numericStatBarMarkup(0, 10, 100)).toBe('');
    expect(numericStatBarMarkup(200, 150, 1000)).toBe('');
    expect(numericStatBarMarkup(1200, undefined, 1000)).toBe('');
  });

  it('collects only deployed heroes, troops, and spells for the result summary strip', () => {
    const entries = deployedArmySummary({
      heroes: [
        { kind: 'king', level: 10, deployed: true },
        { kind: 'queen', level: 12, deployed: false },
      ],
      troops: [
        { kind: 'swordsman', carried: 20, remaining: 5 },
        { kind: 'archer', carried: 10, remaining: 10 },
      ],
      spells: [
        { kind: 'rage', carried: 2, remaining: 1 },
        { kind: 'heal', carried: 1, remaining: 1 },
      ],
    });
    expect(entries).toEqual([
      { category: 'hero', kind: 'king', count: 1, level: 10 },
      { category: 'troop', kind: 'swordsman', count: 15 },
      { category: 'spell', kind: 'rage', count: 1 },
    ]);
  });

  it('projects replay actions onto deduplicated percentage timeline markers', () => {
    const steps = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]; // 10s total
    const markers = replayTimelineMarkers(
      steps,
      [
        { step: 1, type: 'troop' }, // 10%
        { step: 1, type: 'troop' }, // deduplicated (same 10%)
        { step: 3, type: 'spell' }, // 30%
        { step: 5, type: 'hero' }, // 50%
        { step: 7, type: 'ability' }, // 70%
        { step: 9, type: 'end' }, // ignored
      ],
      10,
    );
    expect(markers).toEqual([
      { pct: 10, kind: 'troop' },
      { pct: 30, kind: 'spell' },
      { pct: 50, kind: 'hero' },
      { pct: 70, kind: 'ability' },
    ]);
    expect(replayTimelineMarkers([], [], 0)).toEqual([]);
  });
});
