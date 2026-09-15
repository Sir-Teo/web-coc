import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { BUILDINGS, TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import {
  NATIVE_CAMPAIGN,
  freshNativeCampaign,
  nativeCampaignIssues,
} from '../src/game/native-campaign';
import { developedSave } from './fixtures/developed-village';

const playable = NATIVE_CAMPAIGN.flatMap((s, i) =>
  nativeCampaignIssues(i).length ? [] : [{ name: s.name, index: i }],
);
const armies = [
  { name: 'ground', units: { swordsman: 30, archer: 30, giant: 8, wizard: 8, wallbreaker: 4 } },
  { name: 'air', units: { balloon: 12, dragon: 4 } },
  { name: 'resources', units: { goblin: 40, giant: 8, wallbreaker: 6, healer: 2 } },
];
describe.each(playable)('native combat: $name', ({ index }) => {
  it.each(armies)(
    'resolves a $name army on the complete native layout',
    ({ units }) => {
      const began = performance.now();
      const m = new GameModel(developedSave());
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.state.army = { ...emptyArmy(), ...units };
      m.state.spells = { lightning: 0, heal: 0, rage: 0, freeze: 0 };
      m.state.king = undefined;
      m.state.troopLevels = Object.fromEntries(
        TROOP_KEYS.map((k) => [k, maxTroopLevel(k)]),
      ) as typeof m.state.army;
      m.startCampaign(index);
      m.discardRecording();
      const b = m.battle!;
      const minX = Math.min(...b.buildings.map((v) => v.x)),
        minY = Math.min(...b.buildings.map((v) => v.y));
      const maxX = Math.max(...b.buildings.map((v) => v.x + BUILDINGS[v.kind].size)),
        maxY = Math.max(...b.buildings.map((v) => v.y + BUILDINGS[v.kind].size));
      const points = [
        [minX - 2, (minY + maxY) / 2],
        [(minX + maxX) / 2, minY - 2],
        [maxX + 2, (minY + maxY) / 2],
        [(minX + maxX) / 2, maxY + 2],
      ];
      let deployed = 0;
      for (const k of TROOP_KEYS) {
        m.activeTroop = k;
        const count = b.remaining[k];
        for (let i = 0; i < count; i++) {
          const [x, y] = points[deployed++ % points.length];
          expect(
            m.deploy(Math.min(47, Math.max(1, x)), Math.min(47, Math.max(1, y))),
            `${k} at ${x},${y}`,
          ).toBe(true);
        }
      }
      // Campaign raids have no timer: a lone survivor chipping maximum-level walls out of every
      // remaining defense's reach can need over ten minutes. The cap only guards against stalls.
      for (let step = 0; step < 24000 && !b.finished; step++) m.step(0.05);
      if (performance.now() - began > 1000)
        console.log(
          JSON.stringify({
            stage: NATIVE_CAMPAIGN[index].name,
            elapsed: b.elapsed,
            finished: b.finished,
            destruction: b.destruction,
            wallMs: performance.now() - began,
            survivors: b.units
              .filter((u) => u.hp > 0)
              .map((u) => ({ kind: u.kind, x: u.x, y: u.y, target: u.target })),
          }),
        );
      expect(
        b.finished,
        `${b.elapsed}s, ${b.destruction}%, ${b.units.filter((u) => u.hp > 0).length} survivors`,
      ).toBe(true);
      expect(Number.isFinite(b.destruction)).toBe(true);
      expect(b.result?.trophies).toBe(0);
      expect(
        b.defenders?.every(
          (d) =>
            d.kind === 'skeleton' ||
            // Ghost Traps release Royal Ghosts; secondary troops and summons have a parent defender.
            (d.kind === 'royalghost' &&
              b.buildings.some((v) => v.id === d.sourceId && v.npc === 'ghost-trap')) ||
            (d.parentId !== undefined && b.defenders!.some((p) => p.id === d.parentId)) ||
            b.garrisons?.some(
              (g) =>
                g.castleId === d.sourceId &&
                g.troops.some((t) => t.kind === d.kind && t.level === d.level),
            ),
        ) ?? true,
      ).toBe(true);
    },
    15000,
  );
});
