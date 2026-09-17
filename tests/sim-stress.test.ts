import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { BUILDINGS, TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import { NATIVE_CAMPAIGN, freshNativeCampaign } from '../src/game/native-campaign';
import { nativeCampaignIssues } from '../src/game/native-campaign';
import { developedSave } from './fixtures/developed-village';

function largestPlayableStage(): number {
  let best = 0;
  let bestCount = -1;
  for (let i = 0; i < NATIVE_CAMPAIGN.length; i++) {
    if (nativeCampaignIssues(i).length) continue;
    const m = new GameModel(developedSave());
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars.fill(1);
    m.state.army = { ...emptyArmy(), archer: 1 };
    m.state.spells = emptySpells();
    m.state.king = undefined;
    m.startCampaign(i);
    const n = m.battle?.buildings.length ?? 0;
    if (n > bestCount) {
      bestCount = n;
      best = i;
    }
  }
  return best;
}

function buildStressBattle(units: Record<string, number>) {
  const stage = largestPlayableStage();
  const m = new GameModel(developedSave());
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars.fill(1);
  m.state.army = { ...emptyArmy(), ...units };
  m.state.spells = emptySpells();
  m.state.king = undefined;
  m.state.troopLevels = Object.fromEntries(
    TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]),
  ) as typeof m.state.army;
  m.startCampaign(stage);
  m.discardRecording();
  const b = m.battle!;
  const minX = Math.min(...b.buildings.map((v) => v.x));
  const minY = Math.min(...b.buildings.map((v) => v.y));
  const maxX = Math.max(...b.buildings.map((v) => v.x + BUILDINGS[v.kind].size));
  const maxY = Math.max(...b.buildings.map((v) => v.y + BUILDINGS[v.kind].size));
  const points = [
    [minX - 2, (minY + maxY) / 2],
    [(minX + maxX) / 2, minY - 2],
    [maxX + 2, (minY + maxY) / 2],
    [(minX + maxX) / 2, maxY + 2],
  ];
  let deployed = 0;
  for (const k of TROOP_KEYS) {
    m.activeTroop = k as (typeof TROOP_KEYS)[number];
    const count = b.remaining[k as keyof typeof b.remaining] ?? 0;
    for (let i = 0; i < count; i++) {
      const [x, y] = points[deployed++ % points.length];
      m.deploy(Math.min(47, Math.max(1, x)), Math.min(47, Math.max(1, y)));
    }
  }
  return { m, b, stage };
}

describe('sim stress benchmark', () => {
  it('ticks the largest campaign base within budget', () => {
    const { m, b, stage } = buildStressBattle({
      swordsman: 100,
      archer: 100,
      giant: 40,
      wizard: 40,
      goblin: 60,
      wallbreaker: 20,
      balloon: 20,
      healer: 8,
      dragon: 6,
      pekka: 6,
    });
    const buildings = b.buildings.length;
    const walls = b.buildings.filter((v) => v.kind === 'wall').length;
    const units = b.units.length;
    // Warm up routes so the measured ticks hit the steady-state hot loops.
    for (let i = 0; i < 20 && !b.finished; i++) m.step(0.05);
    const samples: number[] = [];
    const TICKS = 120;
    for (let i = 0; i < TICKS && !b.finished; i++) {
      const t0 = performance.now();
      m.step(0.05);
      samples.push(performance.now() - t0);
    }
    samples.sort((a, c) => a - c);
    const mean = samples.reduce((n, v) => n + v, 0) / Math.max(1, samples.length);
    const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))];
    const worst = samples[samples.length - 1];
    console.log(
      JSON.stringify({ stage, buildings, walls, units, ticks: samples.length, mean, p95, worst }),
    );
    expect(b.units.length).toBeGreaterThan(0);
    // Generous guardrail: catches 10x regressions without flaking on CI hardware.
    expect(mean).toBeLessThan(100);
  });
});
