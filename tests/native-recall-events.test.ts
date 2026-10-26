import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { petSummonRecallRecording } from './fixtures/pet-summon-recall';
import { nativeRecallUnitRecording } from './fixtures/native-recall-unit';
it.each([1, 10])(
  'Recall level-%s pet owner records primary disappearance and redeployment without changing version-121 physics',
  (level) => {
    const r = petSummonRecallRecording(level),
      recalled = r.snapshots.find((s) => s.at === r.recalled)!.battle as Battle,
      blocked = r.snapshots.find((s) => s.at === r.blocked)!.battle as Battle;
    expect(recalled.nativeRecallEvents).toHaveLength(1);
    expect(blocked.nativeRecallEvents?.map((e) => e.phase)).toEqual(['disappear', 'redeploy']);
    const out = blocked.nativeRecallEvents![0],
      into = blocked.nativeRecallEvents![1];
    expect(out.at).toBeCloseTo(r.recalled, 9);
    expect(into.at).toBeGreaterThan(out.at);
    expect(into).toMatchObject({ x: 5, y: 6.5 });
    expect(into.unitId).not.toBe(out.unitId);
    const model = new GameModel();
    for (const version of [r.data.version, 121]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        const expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle,
          actual = JSON.parse(JSON.stringify(model.battle)) as Battle;
        if (version === 121) {
          delete expected.nativeRecallPresentation;
          delete expected.nativeRecallEvents;
        }
        expect(actual).toEqual(expected);
      }
    }
  },
);
it.each([0, 11])(
  'wounded ordinary troops preserve health with a %s-second Recall wait',
  (delay) => {
    const r = nativeRecallUnitRecording(delay),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle as Battle;
    expect(at(r.before).units.find((u) => u.id === r.oldId)!.hp).toBeLessThan(
      at(r.before).units.find((u) => u.id === r.oldId)!.maxHp,
    );
    expect(at(r.disappeared).units.some((u) => u.id === r.oldId)).toBe(false);
    expect(at(r.returning).units.find((u) => u.id === r.newId)!.hp).toBe(r.hp);
    expect(at(r.forgotten).nativeRecallEvents).toEqual([]);
    const model = new GameModel();
    for (const version of [r.data.version, 121]) {
      const data = structuredClone(r.data);
      data.version = version;
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        const expected = JSON.parse(JSON.stringify(snapshot.battle)) as Battle;
        if (version === 121) {
          delete expected.nativeRecallPresentation;
          delete expected.nativeRecallEvents;
        }
        expect(model.battle).toEqual(expected);
      }
    }
  },
);
