import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { BUILDINGS, TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import {
  NATIVE_CAMPAIGN,
  freshNativeCampaign,
  nativeCampaignIssues,
  nativeDefendingHeroes,
} from '../src/game/native-campaign';
import { developedSave } from './fixtures/developed-village';

const playable = NATIVE_CAMPAIGN.flatMap((s, i) =>
  nativeCampaignIssues(i).length ? [] : [{ name: s.name, index: i }],
);
export const armies = [
  { name: 'ground', units: { swordsman: 30, archer: 30, giant: 8, wizard: 8, wallbreaker: 4 } },
  { name: 'air', units: { balloon: 12, dragon: 4 } },
  { name: 'resources', units: { goblin: 40, giant: 8, wallbreaker: 6, healer: 2 } },
];
/**
 * Every playable native stage against one army. Each army has its own test file, so the
 * sweep (the longest job in the suite by far) runs on three workers instead of one.
 */
export function nativeCombatSweep(army: (typeof armies)[number]) {
  describe.each(playable)('native combat: $name', ({ index }) => {
    it(`resolves a ${army.name} army on the complete native layout`, () => {
      const { units } = army;
      const began = performance.now();
      const m = new GameModel(developedSave());
      m.state.nativeCampaign = freshNativeCampaign();
      m.state.nativeCampaign.stars.fill(1);
      m.state.army = { ...emptyArmy(), ...units };
      m.state.spells = emptySpells();
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
      // One drop point outside each side of the base. A layout that reaches the board edge has
      // no room on that side, so only the sides that are actually free are used.
      const tile = (value: number) => Math.min(47, Math.max(1, Math.round(value)));
      const points = (
        [
          [minX - 2, (minY + maxY) / 2],
          [(minX + maxX) / 2, minY - 2],
          [maxX + 2, (minY + maxY) / 2],
          [(minX + maxX) / 2, maxY + 2],
        ] as const
      )
        .map(([x, y]) => [tile(x), tile(y)] as const)
        .filter(([x, y]) => !m.deployBlocked(x, y));
      // A village drawn to the board's edge leaves no room beside it; scan for anywhere legal.
      if (!points.length)
        for (let x = 1; x < 48 && !points.length; x++)
          for (let y = 1; y < 48 && !points.length; y++)
            if (!m.deployBlocked(x, y)) points.push([x, y] as const);
      expect(
        points.length,
        `${NATIVE_CAMPAIGN[index].name} has no free drop point`,
      ).toBeGreaterThan(0);
      let deployed = 0;
      for (const k of TROOP_KEYS) {
        m.activeTroop = k;
        const count = b.remaining[k];
        for (let i = 0; i < count; i++) {
          const [x, y] = points[deployed++ % points.length];
          expect(m.deploy(x, y), `${k} at ${x},${y}`).toBe(true);
        }
      }
      // Campaign raids have no timer: a lone survivor chipping through a village out of every
      // remaining defense's reach can need half an hour. The cap only guards against stalls,
      // and a battle that ends earlier leaves the loop immediately.
      for (let step = 0; step < 48000 && !b.finished; step++) m.step(0.05);
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
      // A campaign raid has no timer, so an attack that cannot finish the village is a real
      // outcome: the player ends it. What must never happen is a village that goes nowhere,
      // leaves a crowd standing, or refuses to settle when the battle is ended.
      const survivors = b.units.filter((u) => u.hp > 0).length;
      const where = `${b.elapsed}s, ${b.destruction}%, ${survivors} survivors`;
      if (!b.finished) {
        expect(b.destruction, where).toBeGreaterThan(0);
        expect(survivors, where).toBeLessThanOrEqual(2);
        m.finishBattle();
        expect(b.finished, where).toBe(true);
      }
      expect(Number.isFinite(b.destruction)).toBe(true);
      expect(b.result?.trophies).toBe(0);
      expect(
        b.defenders?.every(
          (d) =>
            d.kind === 'skeleton' ||
            // Heroes the source posts on defence, at the level it names.
            (d.kind === 'hero' &&
              nativeDefendingHeroes(index).some((h) => h.kind === d.hero && h.level === d.level)) ||
            // Ghost Traps release Royal Ghosts; secondary troops and summons have a parent defender.
            (d.kind === 'royalghost' &&
              b.buildings.some((v) => v.id === d.sourceId && v.npc === 'ghost-trap')) ||
            // Town Hall Guardians and Defending Builders belong to the building they came from.
            ((d.kind === 'guardian' || d.kind === 'repairer') &&
              b.buildings.some((v) => v.id === d.sourceId)) ||
            ('parentId' in d &&
              d.parentId !== undefined &&
              b.defenders!.some((p) => p.id === d.parentId)) ||
            b.garrisons?.some(
              (g) =>
                g.castleId === d.sourceId &&
                g.troops.some((t) => t.kind === d.kind && t.level === d.level),
            ),
        ) ?? true,
      ).toBe(true);
    }, 15000);
  });
}
