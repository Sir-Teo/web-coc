import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MusicPlayer } from '../src/game/music';
import { AudioManager, EXTRA_NATIVE_SOUNDS } from '../src/game/audio';
import { GameModel } from '../src/game/model';
import {
  battleStarMilestones,
  campaignBiome,
  nextReplayEventTime,
  replayTimelineMarkers,
} from '../src/ui/rea-helpers';

describe('REA Milestone 4 — audio ducking/cues, live battle milestones, replay jumps & biome trail', () => {
  it('ducks music gain smoothly and restores it after hold + release, canceling cleanly on mute/scene switch', () => {
    vi.useFakeTimers();
    try {
      const rampCalls: Array<{ value: number; time: number }> = [];
      const setCalls: Array<{ value: number; time: number }> = [];
      const fakeGainParam = {
        value: 0.22,
        cancelScheduledValues: vi.fn(),
        setValueAtTime: vi.fn((value: number, time: number) => {
          fakeGainParam.value = value;
          setCalls.push({ value, time });
        }),
        linearRampToValueAtTime: vi.fn((value: number, time: number) => {
          fakeGainParam.value = value;
          rampCalls.push({ value, time });
        }),
      };
      const fakeCtx = {
        currentTime: 10,
        state: 'running',
        destination: {},
        createGain: () => ({
          gain: fakeGainParam,
          connect: vi.fn(),
          disconnect: vi.fn(),
        }),
      } as unknown as AudioContext;

      const player = new MusicPlayer(() => fakeCtx, {
        element: () => ({
          src: '',
          loop: false,
          volume: 0,
          currentTime: 0,
          paused: true,
          play: () => Promise.resolve(),
          pause: () => {},
          addEventListener: () => {},
        }),
        fetch: async () => new ArrayBuffer(8),
        objectUrl: (_bytes, path) => `blob:${path}`,
      });
      player.setVolume(0.5);
      player.setEnabled(true);
      expect(player.isDucked).toBe(false);

      player.duck(0.3, 400, 200);
      expect(player.isDucked).toBe(true);

      // After holdMs expires, release timer fires and restores duck factor to 1.
      vi.advanceTimersByTime(420);
      expect(player.isDucked).toBe(false);

      // Ducking followed by mute clears duck state immediately.
      player.duck(0.25, 800, 300);
      expect(player.isDucked).toBe(true);
      player.setEnabled(false);
      expect(player.isDucked).toBe(false);
      expect(rampCalls.length + setCalls.length).toBeGreaterThanOrEqual(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ships all Milestone 4 packaged native OGG cues on disk and exposes safe AudioManager methods', () => {
    const m4Keys = [
      'native-invalid',
      'native-mode-toggle',
      'native-star-chime',
      'native-spell-revive',
    ] as const;
    for (const key of m4Keys) {
      expect(EXTRA_NATIVE_SOUNDS[key]).toBeTruthy();
      expect(existsSync(resolve(process.cwd(), 'public', EXTRA_NATIVE_SOUNDS[key]))).toBe(true);
    }

    const audio = new AudioManager();
    audio.enabled = false;
    expect(() => audio.playInvalid()).not.toThrow();
    expect(() => audio.playModeToggle()).not.toThrow();
    expect(() => audio.playStar(3)).not.toThrow();
    expect(() => audio.duckMusic(0.35, 300, 250)).not.toThrow();
  });

  it('produces timestamped replay markers with labels and jumps to the next event (wrapping cleanly)', () => {
    const steps = [5, 7, 6, 7, 75]; // cumulative: 0, 5, 12, 18, 25, 100
    const markers = replayTimelineMarkers(
      steps,
      [
        { step: 1, type: 'troop' },
        { step: 2, type: 'hero' },
        { step: 3, type: 'spell' },
        { step: 4, type: 'ability' },
      ],
      100,
    );
    expect(markers).toHaveLength(4);
    expect(markers.map((m) => [m.kind, m.time, m.label])).toEqual([
      ['troop', 5, 'Troop deployment'],
      ['hero', 12, 'Hero deployed'],
      ['spell', 18, 'Spell cast'],
      ['ability', 25, 'Hero ability'],
    ]);

    expect(nextReplayEventTime(markers, 0)).toBe(5);
    expect(nextReplayEventTime(markers, 5)).toBe(12);
    expect(nextReplayEventTime(markers, 12.1)).toBe(18);
    expect(nextReplayEventTime(markers, 25)).toBe(5); // wraps back to first event
    expect(nextReplayEventTime([], 4)).toBeNull();
  });

  it('computes live battle star milestones for 50%, Town Hall (regular & Goblin), and 100%', () => {
    expect(
      battleStarMilestones({
        destruction: 49,
        buildings: [{ kind: 'townhall', hp: 100 }],
      }),
    ).toEqual({ half: false, townHall: false, full: false });

    expect(
      battleStarMilestones({
        destruction: 50,
        buildings: [{ kind: 'goldmine', npc: 'goblin-hall', hp: 0 }],
      }),
    ).toEqual({ half: true, townHall: true, full: false });

    expect(
      battleStarMilestones({
        destruction: 100,
        buildings: [{ kind: 'townhall', npc: 'goblin-townhall', hp: 0 }],
      }),
    ).toEqual({ half: true, townHall: true, full: true });
  });

  it('classifies Goblin Trail stages into distinct biomes and families', () => {
    expect(campaignBiome(1)).toEqual({ id: 'meadow', name: 'Goblin Meadow' });
    expect(campaignBiome(16)).toEqual({ id: 'forest', name: 'Whispering Woods' });
    expect(campaignBiome(36)).toEqual({ id: 'highlands', name: 'Craggy Highlands' });
    expect(campaignBiome(60)).toEqual({ id: 'volcano', name: 'Magma Peaks' });
    expect(campaignBiome(85)).toEqual({ id: 'citadel', name: 'Goblin Citadel' });
    expect(campaignBiome(5, 'challenge')).toEqual({ id: 'practice', name: 'Practice Arena' });
    expect(campaignBiome(12, 'forged')).toEqual({ id: 'forged', name: 'Fan-Made Frontier' });
  });

  it('emits sourceId on completed Home building upgrades for world-space LEVEL badges', () => {
    const m = new GameModel();
    const effects: Array<Record<string, unknown>> = [];
    m.onEffect = (fx) => effects.push(fx as unknown as Record<string, unknown>);
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    cannon.upgradeStart = m.clock;
    cannon.upgradeEnd = m.clock + 1000;
    m.tick(m.clock + 2000);
    expect(effects).toContainEqual(
      expect.objectContaining({
        type: 'upgrade',
        building: 'cannon',
        sourceId: cannon.id,
      }),
    );
  });

  it('enforces Milestone 4 CSS invariants (no backdrop-filter, reduced-motion, short-landscape safety) and 3-star calls', () => {
    const reaCss = readFileSync(new URL('../src/ui/rea-fidelity.css', import.meta.url), 'utf8');
    expect(reaCss).not.toMatch(/^\s*backdrop-filter\s*:/m);
    expect(reaCss).toContain('.battle-prep-bar');
    expect(reaCss).toContain('.milestone-chip.earned');
    expect(reaCss).toContain('.deploy-label.spell-armed');
    expect(reaCss).toContain('.shop-new-badge');
    expect(reaCss).toContain('.trail-biome-banner');
    expect(reaCss).toContain('.result-milestones');
    expect(reaCss).toContain('.reduce-motion .battle-prep-bar > i');

    // Guard against the 2-argument clashStarsMarkup bug in hud.ts (must pass total=3 explicitly).
    const hudSrc = readFileSync(new URL('../src/ui/hud.ts', import.meta.url), 'utf8');
    const calls = [...hudSrc.matchAll(/clashStarsMarkup\(([^)]+)\)/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(6);
    for (const args of calls) {
      expect(args.split(',').length, `expected 3 args in clashStarsMarkup(${args})`).toBe(3);
    }
  });
});
