import { expect, it } from 'vitest';
import { TROOPS } from '../src/game/data';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import type { ReplayData } from '../src/game/replay';
import { nativeCampaignIssues } from '../src/game/native-campaign';
import {
  FREEZE_VILLAGE_ARMY,
  TORNADO_VILLAGE_ARMY,
  coldFlameReplay,
  liveNativeBattle,
  trapVillageBattle,
} from './fixtures/late-trap-battle';

const seeker = (m: GameModel) => (time: number) => {
  m.seekReplay(time);
  while (m.replay!.seeking) m.step(0.05);
  return JSON.stringify(m.battle);
};
const held = (b: Battle) =>
  b.units.filter(
    (u) => u.late?.tornadoTrap || (u.late?.freezeTrap && u.late.freezeTrap.until > b.elapsed),
  ).length;

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

for (const [index, trap, army] of [
  [66, 'tornadotrap', TORNADO_VILLAGE_ARMY],
  [64, 'freeze-trap', FREEZE_VILLAGE_ARMY],
] as const)
  it(`reconstructs real ${trap} deployments in village ${index} across portable backward seeks`, () => {
    expect(nativeCampaignIssues(index)).toEqual([]);
    const { m, trapId } = trapVillageBattle(index, trap, army);
    const b = m.battle!;
    const snapshots = new Map<number, string>();
    let most = 0;
    for (let step = 0; step < 12000 && !b.finished; step++) {
      if ([1, 5, 14, 30, 60, 120, 240, 480].includes(step)) snapshots.set(step, JSON.stringify(b));
      m.step(0.05);
      most = Math.max(most, held(b));
    }
    expect(b.finished).toBe(true);
    expect(b.traps[trapId]).toBeDefined();
    expect(most).toBeGreaterThan(0);
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
  // Cold Flame stays gated by other late families; unimplemented ones are inert in this fixture.
  const { setup, deployments, data, tornado, corner } = coldFlameReplay();
  expect([tornado.level, corner.level]).toEqual([3, 1]);
  const live = liveNativeBattle(setup, deployments);
  const snapshots = new Map<number, string>();
  let carried = 0;
  for (let step = 0; step < data.steps.length && !live.battle!.finished; step++) {
    if ([2, 14, 40, 120, 250, 300, 600].includes(step))
      snapshots.set(step, JSON.stringify(live.battle));
    live.step(0.05);
    carried = Math.max(carried, live.battle!.units.filter((u) => u.late?.tornadoTrap).length);
  }
  // Goblin Hall and armed Builder's Hut weapons now fire here, so troops can outlast the
  // recording. Its final end action settles the replay; settle live combat the same way.
  live.finishBattle();
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
