import { defaultSpellLevels } from '../src/game/army';
import { describe, expect, it } from 'vitest';
import { BUILDINGS, type TroopKind } from '../src/game/data';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateReplay, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { MONOLITH_READY } from '../src/game/monolith';
import { SPELL_TOWER_READY } from '../src/game/spell-tower';
import { NATIVE_CAMPAIGN, nativeCampaignIssues, nativeLayout } from '../src/game/native-campaign';
import { deploySpots, lateBattle, lateReplay, lateSetup } from './fixtures/late-defense-battle';

type Case = [
  index: number,
  army: Partial<Record<TroopKind, number>>,
  anchor: (b: { kind: string; spellTowerWeapon?: string }) => boolean,
  steps: number,
];
const cases: Case[] = [
  [85, { dragon: 8, giant: 16 }, (b) => b.kind === 'monolith', 900],
  [86, { dragon: 8, giant: 16 }, (b) => b.kind === 'spelltower', 900],
  [87, { dragon: 8, giant: 16 }, (b) => b.kind === 'spelltower', 900],
  [88, { dragon: 8, wizard: 16 }, (b) => b.kind === 'spelltower', 900],
  [89, { dragon: 8, giant: 16 }, (b) => b.spellTowerWeapon === 'poison', 900],
];

function recording([index, army, anchor, steps]: Case): ReplayData {
  const setup = lateSetup(index, army);
  const probe = lateBattle(setup);
  const tower = probe.battle!.buildings.find(anchor)!;
  const size = BUILDINGS[tower.kind].size;
  const count = Object.values(army).reduce((n, v) => n + (v ?? 0), 0);
  const spots = deploySpots(probe, tower.x + size / 2, tower.y + size / 2, count);
  let s = 0;
  const deployments = Object.entries(army).flatMap(([kind, n]) =>
    Array.from({ length: n ?? 0 }, () => ({ step: 0, kind: kind as TroopKind, ...spots[s++] })),
  );
  return lateReplay(
    setup,
    deployments.map(({ step, kind, x, y }) => ({ step, kind, x, y })),
    steps,
  );
}

describe('Monolith and Spell Tower campaign gate', () => {
  it('no longer blocks villages 85-89 on either family, with every placement and weapon kept', () => {
    expect(MONOLITH_READY).toBe(true);
    expect(SPELL_TOWER_READY).toBe(true);
    const counts: Record<number, [monoliths: number, weapons: string[]]> = {
      85: [7, []],
      86: [0, Array(8).fill('rage')],
      87: [0, Array(4).fill('poison')],
      88: [0, Array(7).fill('invisibility')],
      89: [2, ['invisibility', 'invisibility', 'poison', 'poison', 'poison', 'poison', 'rage']],
    };
    for (const [index, [monoliths, weapons]] of Object.entries(counts).map(
      ([i, v]) => [+i, v] as const,
    )) {
      const issues = nativeCampaignIssues(index);
      expect(issues).not.toContain('Monolith');
      expect(issues).not.toContain('Spell Tower');
      expect(issues).not.toContain('Unknown Spell Tower weapon');
      const layout = nativeLayout(index);
      const source = [...NATIVE_CAMPAIGN[index].buildings, ...NATIVE_CAMPAIGN[index].traps];
      expect(source.filter(([data]) => data === 1000077).map(([, , , level]) => level)).toEqual(
        Array(monoliths).fill(2),
      );
      expect(layout.filter((b) => b.kind === 'monolith').map((b) => b.level)).toEqual(
        Array(monoliths).fill(2),
      );
      const towers = layout.filter((b) => b.kind === 'spelltower');
      expect(towers.every((b) => b.level === 3)).toBe(true);
      expect(towers.map((b) => b.spellTowerWeapon).sort()).toEqual(weapons);
    }
  });
});

describe('Monolith and Spell Tower replays', () => {
  for (const c of cases)
    it(`reconstructs village ${c[0]} from a portable file with backward seeks`, () => {
      const data = recording(c);
      expect(validateReplay(data)).toBe(true);
      const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
      expect(record.initial.buildings).toEqual(data.initial.buildings);
      const viewer = new GameModel();
      const home = JSON.stringify(viewer.state);
      expect(viewer.openReplay(record)).toBe(true);
      const seek = (time: number) => {
        viewer.seekReplay(time);
        while (viewer.replay!.seeking) viewer.step(0.05);
        return JSON.stringify(viewer.battle);
      };
      const times = [1, 2.5, 6, 12, 25, 44.95];
      const snapshots = times.map((t) => [t, seek(t)] as const);
      const end = JSON.parse(snapshots.at(-1)![1]);
      const late = end.late ?? {};
      const fired = Object.values(late.monolith?.towers ?? {}).reduce(
        (n: number, t) => n + (t as { fired: number }).fired,
        0,
      );
      const weapons = new Set(
        (late.spellTower?.casts ?? []).map((cast: { weapon: string }) => cast.weapon),
      );
      const expected = { 86: 'rage', 87: 'poison', 88: 'invisibility', 89: 'poison' }[c[0] as 86];
      if (c[0] === 85) expect(fired).toBeGreaterThan(0);
      else expect(weapons.has(expected)).toBe(true);
      for (const [time, snapshot] of [...snapshots].reverse()) expect(seek(time)).toBe(snapshot);
      viewer.returnHome();
      expect(JSON.stringify(viewer.state)).toBe(home);
    }, 120000);

  it('rejects late kinds and weapon fields before version 44 and outside campaigns', () => {
    const data = recording(cases[1]);
    expect(validateReplay(data)).toBe(true);
    expect(validateReplay({ ...data, version: 43 })).toBe(false);
    const monolith = recording(cases[0]);
    expect(validateReplay({ ...monolith, version: 43 })).toBe(false);
    const withoutWeapon = structuredClone(data);
    delete withoutWeapon.initial.buildings.find((b) => b.kind === 'spelltower')!.spellTowerWeapon;
    expect(validateReplay(withoutWeapon)).toBe(false);
    const misplaced = structuredClone(data);
    misplaced.initial.buildings.find((b) => b.kind === 'wall')!.spellTowerWeapon = 'rage';
    expect(validateReplay(misplaced)).toBe(false);
    const unknown = structuredClone(data);
    (
      unknown.initial.buildings.find((b) => b.kind === 'spelltower') as { spellTowerWeapon: string }
    ).spellTowerWeapon = 'earthquake';
    expect(validateReplay(unknown)).toBe(false);
    // A home practice copy can never carry a campaign-only late defense.
    const practice: ReplayData = {
      version: 44,
      initial: {
        index: 0,
        practice: true,
        nextId: 100,
        buildings: [makeBuilding(1, 'townhall', 10, 10, 8), makeBuilding(2, 'monolith', 20, 20, 2)],
        army: data.initial.army,
        spells: data.initial.spells,
        spellLevels: defaultSpellLevels(),
        troopLevels: data.initial.troopLevels,
      },
      steps: [],
      actions: [{ type: 'end', step: 0 }],
    };
    expect(validateReplay(practice)).toBe(false);
  });
});
