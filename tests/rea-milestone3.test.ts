import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  builderBadgeSvg,
  clashStarSvg,
  clashStarsMarkup,
  leagueBadgeSvg,
  resourceEmblemSvg,
  shieldBadgeSvg,
  xpStarSvg,
} from '../src/ui/clash-emblems';
import { buildingAudioCue, EXTRA_NATIVE_SOUNDS } from '../src/game/audio';
import { GameModel } from '../src/game/model';
import { BUILDINGS } from '../src/game/data';

describe('REA Milestone 3 — Clash emblems, native audio routing & flow models', () => {
  it('renders sculpted Clash emblems and caches repeated SVG strings', () => {
    expect(xpStarSvg(50)).toContain('class="xp-star-svg"');
    expect(xpStarSvg(50)).toBe(xpStarSvg(50));

    const earnedStar = clashStarSvg(true, 24);
    const emptyStar = clashStarSvg(false, 24);
    expect(earnedStar).toContain('clash-star-svg earned');
    expect(emptyStar).toContain('clash-star-svg empty');
    expect(earnedStar).not.toBe(emptyStar);

    const row = clashStarsMarkup(2, 3, 20);
    expect((row.match(/clash-star earned/g) ?? []).length).toBe(2);
    expect((row.match(/clash-star empty/g) ?? []).length).toBe(1);

    for (const tier of [
      'unranked',
      'bronze',
      'silver',
      'gold',
      'crystal',
      'master',
      'champion',
      'titan',
      'legend',
    ] as const) {
      expect(leagueBadgeSvg(tier, 22)).toContain(`tier-${tier}`);
    }
    expect(builderBadgeSvg(22)).toContain('builder-badge-svg');
    expect(shieldBadgeSvg(22)).toContain('shield-badge-svg');
    for (const kind of ['gold', 'elixir', 'dark', 'gem'] as const) {
      expect(resourceEmblemSvg(kind)).toContain(`resource-svg ${kind}`);
    }
  });

  it('routes buildings to packaged Clash native pickup/place OGG cues on disk', () => {
    expect(buildingAudioCue('archertower', 'pickup').key).toBe('native-at-pick');
    expect(buildingAudioCue('archertower', 'place').key).toBe('native-at-place');
    expect(buildingAudioCue('darkdrill', 'pickup').key).toBe('native-drill-pick');
    expect(buildingAudioCue('darkdrill', 'place').key).toBe('native-drill-place');
    expect(buildingAudioCue('inferno', 'pickup').key).toBe('native-inferno-pick');
    expect(buildingAudioCue('inferno', 'place').key).toBe('native-inferno-place');
    expect(buildingAudioCue('xbow', 'place').key).toBe('native-bow-place');
    expect(buildingAudioCue('wall', 'pickup')).toMatchObject({
      key: 'village-wall_pickup_01.ogg',
      pitch: 0.96,
    });
    expect(buildingAudioCue('cannon', 'pickup').pitch).toBeLessThan(1);
    expect(buildingAudioCue('laboratory', 'pickup').pitch).toBeGreaterThan(1);
    expect(buildingAudioCue('townhall', 'place')).toMatchObject({
      key: 'village-building_construct_07.ogg',
      pitch: 0.72,
    });

    // Every extra packaged native OGG sample exists under public/.
    for (const [key, relPath] of Object.entries(EXTRA_NATIVE_SOUNDS)) {
      expect(existsSync(resolve(process.cwd(), 'public', relPath)), `missing ${key} (${relPath})`).toBe(
        true,
      );
    }
  });

  it('supports Edit Mode Drag-to-Swap for same-size buildings and cleanly resets Scout/Photo modes', () => {
    const model = new GameModel();
    model.state.gold = 999_999;
    model.state.elixir = 999_999;
    const th = model.state.buildings.find((b) => b.kind === 'townhall');
    if (th) th.level = 6;

    // Ensure at least two same-size (3x3) buildings exist.
    const threeByThree = model.state.buildings.filter((b) => BUILDINGS[b.kind].size === 3);
    expect(threeByThree.length).toBeGreaterThanOrEqual(2);
    const [a, b] = threeByThree;
    const origA = { x: a.x, y: a.y };
    const origB = { x: b.x, y: b.y };

    model.beginEdit();
    model.toggleEditScoutView();
    model.toggleEditPhotoMode();
    expect(model.editScoutView).toBe(true);
    expect(model.editPhotoMode).toBe(true);

    // Dragging `a` onto `b` arms dragSwapTarget and swaps positions atomically on endDrag().
    model.beginDrag();
    expect(model.dragTo(a.id, origB.x, origB.y)).toBe(true);
    expect(model.dragSwapTarget).toBe(b.id);
    model.endDrag();
    expect(model.dragSwapTarget).toBeNull();
    expect({ x: a.x, y: a.y }).toEqual(origB);
    expect({ x: b.x, y: b.y }).toEqual(origA);

    // Undo restores both buildings atomically.
    model.undo();
    expect({ x: a.x, y: a.y }).toEqual(origA);
    expect({ x: b.x, y: b.y }).toEqual(origB);

    // Exiting edit mode clears Scout View and Photo Mode.
    model.endEdit();
    expect(model.editScoutView).toBe(false);
    expect(model.editPhotoMode).toBe(false);
  });

  it('cycles Ladder opponents with nextLadderMatch() during pre-deploy scouting only', () => {
    const model = new GameModel();
    model.state.army.swordsman = 12;
    model.startLadder();
    expect(model.battle?.ladder).toBeTruthy();
    const firstBattle = model.battle!;
    const firstSeed = model.state.ladderSeed ?? 0;

    expect(model.nextLadderMatch()).toBe(true);
    expect(model.battle?.ladder).toBeTruthy();
    expect(model.battle).not.toBe(firstBattle);
    expect(model.state.ladderSeed).toBe(firstSeed + 1);

    // Once a troop is deployed (battle.started === true), Next is refused.
    for (let x = 1; x < 24; x++) {
      if (!model.deployBlocked(x, 1)) {
        model.activeTroop = 'swordsman';
        model.deploy(x, 1);
        break;
      }
    }
    expect(model.battle!.started).toBe(true);
    expect(model.nextLadderMatch()).toBe(false);
  });

  it('keeps REA Milestone 3 CSS free of backdrop-filter and wired into reduced-motion rules', () => {
    const reaCss = readFileSync(new URL('../src/ui/rea-fidelity.css', import.meta.url), 'utf8');
    expect(reaCss).not.toMatch(/^\s*backdrop-filter\s*:/m);
    expect(reaCss).toContain('.canvas-place-actions');
    expect(reaCss).toContain('.army-overview-bar');
    expect(reaCss).toContain('.campaign-trail-map');
    expect(reaCss).toContain('.reduce-motion .troop-card.ready-next');
  });
});
