import { expect, it } from 'vitest';
import { BUILDINGS, TROOPS } from '../src/game/data';
import { GameModel, type Army, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { replayBattle, type ReplayData } from '../src/game/replay';
import { nativeCampaignIssues } from '../src/game/native-campaign';
import {
  lateTrapVillage,
  nativeReplay,
  nativeSetup,
  nearestDeploy,
} from './fixtures/late-trap-battle';

const trapCenter = (b: Battle, id: number) => {
  const t = b.buildings.find((v) => v.id === id)!;
  return [t.x + BUILDINGS[t.kind].size / 2, t.y + BUILDINGS[t.kind].size / 2] as const;
};
const seeker = (m: GameModel) => (time: number) => {
  m.seekReplay(time);
  while (m.replay!.seeking) m.step(0.05);
  return JSON.stringify(m.battle);
};

function expectPortableSeeks(
  m: GameModel,
  data: ReplayData,
  snapshots: Map<number, string>,
  end: string,
) {
  const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  expect(record.version).toBe(44);
  expect(m.openReplay(record)).toBe(true);
  const seek = seeker(m);
  for (const [step, snapshot] of [...snapshots].reverse()) {
    const at = record.steps.slice(0, step).reduce((a, b) => a + b, 0);
    expect(JSON.parse(seek(at))).toEqual(JSON.parse(snapshot));
    seek(0);
    expect(JSON.parse(seek(at))).toEqual(JSON.parse(snapshot));
  }
  expect(JSON.parse(seek(9999))).toEqual(JSON.parse(end));
}

for (const [index, trapKind, army] of [
  [66, 'tornadotrap', { giant: 6, swordsman: 12, balloon: 6 }],
  [64, 'freeze-trap', { giant: 6, swordsman: 12, dragon: 3 }],
] as const)
  it(`reconstructs real ${trapKind} deployments in village ${index} across portable backward seeks`, () => {
    expect(nativeCampaignIssues(index)).toEqual([]);
    const m = lateTrapVillage(index, army as Partial<Army>);
    const b = m.battle!;
    const traps = b.buildings.filter((v) => v.kind === trapKind || v.npc === trapKind);
    const [x, y] = trapCenter(b, traps[1].id);
    const [px, py] = nearestDeploy(m, x, y);
    for (const kind of Object.keys(army) as (keyof Army)[]) {
      m.activeTroop = kind;
      while (b.remaining[kind]) expect(m.deploy(px, py)).toBe(true);
    }
    const snapshots = new Map<number, string>();
    let held = 0;
    for (let step = 0; step < 12000 && !b.finished; step++) {
      if ([1, 5, 14, 30, 60, 120, 240, 480].includes(step)) snapshots.set(step, JSON.stringify(b));
      m.step(0.05);
      held = Math.max(
        held,
        b.units.filter(
          (u) => u.late?.tornadoTrap || (u.late?.freezeTrap && u.late.freezeTrap.until > b.elapsed),
        ).length,
      );
    }
    expect(b.finished).toBe(true);
    expect(b.traps[traps[1].id]).toBeDefined();
    expect(held).toBeGreaterThan(0);
    // Both layers were present in the attack.
    expect(b.units.some((u) => TROOPS[u.kind].flying)).toBe(true);
    expect(b.units.some((u) => !TROOPS[u.kind].flying)).toBe(true);
    const end = JSON.stringify(b),
      data = structuredClone(m.state.raidLog[0].replay!);
    m.returnHome();
    const home = JSON.stringify(m.state);
    expectPortableSeeks(m, data, snapshots, end);
    m.returnHome();
    expect(JSON.stringify(m.state)).toBe(home);
  }, 60000);

it('replays Cold Flame freeze and level-3 tornado traps identically to live stepping', () => {
  // Cold Flame stays gated by other late families; their buildings are inert in this fixture.
  const army = { pekka: 12, healer: 4, dragon: 6 };
  const setup = nativeSetup(81, army);
  const probe = new GameModel();
  probe.battle = replayBattle(setup, 44);
  const b = probe.battle;
  const tornado = b.buildings.find((v) => v.kind === 'tornadotrap' && v.x === 31 && v.y === 31)!;
  const corner = b.buildings.find((v) => v.npc === 'freeze-trap' && v.x === 35 && v.y === 35)!;
  expect([tornado.level, corner.level]).toEqual([3, 1]);
  const [x, y] = trapCenter(b, corner.id);
  const [px, py] = nearestDeploy(probe, x, y);
  const deployments = (Object.entries(army) as [keyof Army, number][]).flatMap(([kind, count]) =>
    Array.from({ length: count }, () => [kind, px, py] as [keyof Army, number, number]),
  );
  const data = nativeReplay(setup, deployments, 1200);
  // Live stepping through the same setup, inputs and fixed step sizes.
  const live = new GameModel();
  // Mirror the replay runner's isolated model inputs.
  live.recordBattles = false;
  live.state.army = { ...setup.army };
  live.state.spells = { ...setup.spells };
  live.state.troopLevels = { ...setup.troopLevels };
  live.state.nextId = setup.nextId;
  live.battle = replayBattle(setup, 44);
  for (const [kind, dx, dy] of deployments) {
    live.activeTroop = kind;
    expect(live.deploy(dx, dy)).toBe(true);
  }
  const snapshots = new Map<number, string>();
  let carried = 0;
  for (let step = 0; step < 1200 && !live.battle.finished; step++) {
    if ([2, 14, 40, 120, 250, 300, 600].includes(step))
      snapshots.set(step, JSON.stringify(live.battle));
    live.step(0.05);
    carried = Math.max(carried, live.battle.units.filter((u) => u.late?.tornadoTrap).length);
  }
  const lb = live.battle!;
  expect(Object.keys(lb.late?.tornadoTrap?.vortices ?? {})).toContain(String(tornado.id));
  expect(carried).toBeGreaterThan(0);
  expect(Object.keys(lb.late?.freezeTrap?.casts ?? {})).toContain(String(corner.id));
  expect(lb.units.some((u) => u.late?.freezeTrap)).toBe(true);
  expect(
    lb.units.some((u) => TROOPS[u.kind].flying) && lb.units.some((u) => !TROOPS[u.kind].flying),
  ).toBe(true);
  const m = new GameModel();
  const home = JSON.stringify(m.state);
  expectPortableSeeks(m, data, snapshots, JSON.stringify(lb));
  m.returnHome();
  expect(JSON.stringify(m.state)).toBe(home);
}, 60000);
