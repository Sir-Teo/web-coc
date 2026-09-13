import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import type { ReplayData } from '../src/game/replay';
import type { TroopKind } from '../src/game/data';
import {
  deployNear,
  lateGoblinLive,
  lateGoblinReplay,
  type LateDeploy,
} from './fixtures/late-goblin-battle';

const squad = (
  count: number,
  step: number,
  kind: TroopKind,
  index: number,
  target: string,
  nth = 0,
) => Array.from({ length: count }, () => ({ step, kind, ...deployNear(index, target, nth) }));
const cases: [name: string, index: number, deploys: () => LateDeploy[], portable: boolean][] = [
  [
    "Besieged's Goblin Hall and Communications Masts",
    73,
    () => [
      ...squad(6, 0, 'pekka', 73, 'goblin-hall'),
      ...squad(4, 0, 'dragon', 73, 'comm-mast', 3),
      ...squad(6, 30, 'balloon', 73, 'goblin-hall'),
    ],
    true,
  ],
  [
    "Builderopolis' Builder's Huts",
    84,
    () => [
      ...squad(10, 0, 'giant', 84, 'builder'),
      ...squad(6, 0, 'balloon', 84, 'builder'),
      ...squad(6, 12, 'pekka', 84, 'builder'),
    ],
    true,
  ],
  [
    // Portable files do not yet carry this village's Spell Tower weapon field.
    "M.O.M.M.A's Madhouse Boss Town Hall",
    89,
    () => [
      ...squad(8, 0, 'pekka', 89, 'goblin-boss-th'),
      ...squad(10, 0, 'giant', 89, 'goblin-boss-th'),
      { step: 20, kind: 'lightning', x: 21, y: 21 },
    ],
    false,
  ],
];

it.each(cases)(
  'reconstructs %s through replay seeks in both directions',
  (_, index, deploys, portable) => {
    const data = lateGoblinReplay(index, deploys(), { steps: 900 });
    const snapshots = new Map<number, string>();
    const live = lateGoblinLive(data, 0);
    expect(live.battle!.units.length).toBeGreaterThan(0);
    for (let step = 0; step < 900; step++) {
      // Live results credit the home village; compare combat states before either side settles.
      if (step % 15 === 1 && !live.battle!.finished)
        snapshots.set(step, JSON.stringify(live.battle));
      live.step(0.05);
      for (const a of data.actions.filter((v) => v.step === step + 1))
        if (a.type === 'troop') {
          live.activeTroop = a.kind;
          live.deploy(a.x, a.y);
        } else if (a.type === 'spell') {
          live.activeSpell = a.kind;
          live.castSpell(a.x, a.y);
        }
    }
    const late = live.battle!.late!;
    const fired =
      Object.values(late.goblinBuildings?.weapons ?? {}).reduce((n, w) => n + w.fired, 0) +
      Object.values(late.builderHut?.huts ?? {}).reduce((n, h) => n + h.fired, 0);
    expect(fired).toBeGreaterThan(0);
    expect(snapshots.size).toBeGreaterThan(4);
    let record: ReplayData = structuredClone(data);
    if (portable) {
      record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
      expect(record).toEqual(data);
    }
    const viewer = new GameModel();
    const home = JSON.stringify(viewer.state);
    expect(viewer.openReplay(record)).toBe(true);
    // Portable files normalize key order, so compare complete states structurally.
    const seek = (time: number) => {
      viewer.seekReplay(time);
      while (viewer.replay!.seeking) viewer.step(0.05);
      return JSON.parse(JSON.stringify(viewer.battle));
    };
    const end = seek(9999);
    for (const [step, snapshot] of [...snapshots].reverse())
      expect(seek(step * 0.05)).toEqual(JSON.parse(snapshot));
    expect(seek(9999)).toEqual(end);
    viewer.returnHome();
    expect(JSON.stringify(viewer.state)).toBe(home);
  },
  60000,
);
