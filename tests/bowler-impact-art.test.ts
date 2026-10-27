import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { isGarrisonDefender } from '../src/game/defenders';
import {
  bowlerImpactArtNeeded,
  garrisonBowlerImpactEvents,
  garrisonBowlerContactEffect,
} from '../src/game/bowler-impact-effects';
import effectIndex from '../reference/full-client/effect-art.json';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import type { NativeArtPack } from '../src/game/native-art-pack';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { attackingBowlerBattle } from './fixtures/attacking-bowler';
import { bowlerBouldersRecording } from './fixtures/bowler-boulders';
import { garrisonBowlerImpactRecording } from './fixtures/garrison-bowler-impacts';

const nativeEffectPack = (name: string | undefined) => {
  const id = name && (effectIndex.effects as Record<string, string>)[name];
  return id ? (effectIndex.packs as Record<string, { path: string }>)[id]?.path : undefined;
};
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
for (let level = 1; level <= 10; level++)
  it(`Bowler ${level} retains both original flight packets after their live impacts`, () => {
    const r = attackingBowlerBattle(level);
    r.untilAttacks(1);
    const live = r.battle.projectiles!.find((p) => p.native?.kind === 'bowler')!,
      retained = r.battle.nativeBowlerFlights![0];
    expect(retained).toEqual(live);
    expect(retained).not.toBe(live);
    expect(retained.native).not.toBe(live.native);
    r.until(2.1);
    expect(r.battle.projectiles!.some((p) => p.native?.kind === 'bowler')).toBe(false);
    expect(r.battle.nativeBowlerFlights).toHaveLength(2);
    expect(r.battle.nativeBowlerFlights![0]).toMatchObject({ id: live.id, impact: live.impact });
    expect(r.battle.nativeBowlerFlights![1].native!.bounce).toBe(1);
    expect(bowlerImpactArtNeeded(r.battle)).toContain(
      level < 8 ? 'trollBoulder_destroyed' : 'trollBoulder_destroyed_lvl8',
    );
  });

it('retained primary flight follows its moving target while the second point stays fixed', () => {
  const r = attackingBowlerBattle();
  r.battle.buildings = r.battle.buildings.filter((b) => b.id === 1);
  const target = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 13, 11.5, 0);
  target.alerted = true;
  target.stunnedUntil = 100;
  r.untilAttacks(1);
  const shot = r.battle.projectiles!.find((p) => p.native?.kind === 'bowler')!;
  target.x = 14.4;
  r.step();
  expect(r.battle.nativeBowlerFlights![0]).toMatchObject({
    x: shot.x,
    y: shot.y,
    impact: shot.impact,
  });
  expect(r.battle.nativeBowlerFlights![0].x).toBe(14.4);
  while (r.battle.projectiles!.some((p) => p.id === shot.id)) r.step();
  expect(r.battle.nativeBowlerFlights![0].x).toBe(14.4);
  expect(r.battle.nativeBowlerFlights![1]).toMatchObject({ x: 17, fromX: 14.4 });
});

it('released art packets survive the actor and retire on the bounded history horizon', () => {
  const r = attackingBowlerBattle();
  r.untilAttacks(1);
  r.unit.hp = 0;
  r.until(2.1);
  expect(r.battle.nativeBowlerFlights).toHaveLength(2);
  r.until(12.1);
  expect(r.battle.nativeBowlerFlights).toEqual([]);
});

for (const mode of ['none', 'freeze', 'lightning'] as const)
  it(`defending Bowler draws only the resolved final shatter, mode=${mode}`, () => {
    const r = garrisonBowlerImpactRecording(undefined, mode),
      at = (time: number) => r.snapshots.find((s) => s.at === time)!.battle;
    expect(garrisonBowlerImpactEvents(at(r.hit), iso)).toEqual([]);
    const b = at(r.tail),
      d = b.defenders!.find((d) => isGarrisonDefender(d) && d.kind === 'bowler')!;
    if (!isGarrisonDefender(d)) throw Error('Missing Bowler');
    const attack = d.attacks[0],
      before = JSON.stringify(b),
      events = garrisonBowlerImpactEvents(b, iso);
    expect(events).toEqual([
      {
        key: `garrison:${d.id}:boulder-hit:0`,
        effect: 'trollBoulder_destroyed',
        at: attack.bounceAt,
        ground: iso(attack.bounceX!, attack.bounceY!),
        lift: 16,
        depth: 8001,
        facing: { x: attack.bounceX! - attack.hitX!, y: attack.bounceY! - attack.hitY! },
      },
    ]);
    const event = events[0],
      pack = JSON.parse(
        readFileSync('public/' + nativeEffectPack(event.effect), 'utf8'),
      ) as NativeArtPack;
    expect(nativeEffectPoses(pack, event, event.at + 0.1, false).length).toBeGreaterThan(0);
    const duration = nativeEffectDuration(pack, event.effect);
    expect(garrisonBowlerImpactEvents(b, iso, event.at + duration + 0.01, () => duration)).toEqual(
      [],
    );
    expect(garrisonBowlerImpactEvents(b, iso, event.at - 0.01)).toEqual([]);
    expect(JSON.stringify(b)).toBe(before);
  });

it('sound-only bounces have no native visual graph while both final variants have original art', () => {
  const r = garrisonBowlerImpactRecording(),
    b = r.snapshots.find((s) => s.at === r.hit)!.battle,
    first = garrisonBowlerContactEffect(b, {
      type: 'hit',
      x: 0,
      y: 0,
      sourceDefender: true,
      sourceId: r.id,
      projectileBounce: 0,
    });
  expect(first).toBe('trollBoulder_bounce');
  expect(nativeEffectPack(first)).toBeUndefined();
  expect(
    garrisonBowlerContactEffect(b, {
      type: 'hit',
      x: 0,
      y: 0,
      sourceDefender: true,
      sourceId: r.id,
      projectileBounce: 1,
    }),
  ).toBe('trollBoulder_destroyed');
  expect(nativeEffectPack('trollBoulder_destroyed')).toBeDefined();
  expect(nativeEffectPack('trollBoulder_destroyed_lvl8')).toBeDefined();
});

for (const kind of ['attacker', 'defender'] as const) {
  it(`${kind} art metadata preserves every version-160 physical field`, () => {
    const make = (version: number) =>
      kind === 'attacker'
        ? bowlerBouldersRecording(version)
        : garrisonBowlerImpactRecording(version, 'lightning');
    const old = make(160),
      r = make(161);
    expect(r.snapshots.map((s) => s.at)).toEqual(old.snapshots.map((s) => s.at));
    for (const [i, snapshot] of r.snapshots.entries()) {
      const b = structuredClone(snapshot.battle);
      delete b.nativeBowlerImpactArt;
      delete b.nativeBowlerFlights;
      expect(b).toEqual(old.snapshots[i].battle);
    }
  });
  for (const version of [160, 161])
    it(`full ${kind} version-${version} impact-art snapshots seek both directions`, () => {
      const r =
          kind === 'attacker'
            ? bowlerBouldersRecording(version)
            : garrisonBowlerImpactRecording(version, 'freeze'),
        model = new GameModel();
      expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
      for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
        model.seekReplay(snapshot.at);
        while (model.replay!.seeking) model.step(0.05);
        expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
      }
    });
}
it('only carried Bowlers warm impact graphs, including retained flights without live actors', () => {
  const r = attackingBowlerBattle(10),
    setup = structuredClone(r.data.initial);
  expect(replayBattle(setup).nativeBowlerImpactArt).toBe(true);
  expect(replayBattle(setup, 160).nativeBowlerImpactArt).toBeUndefined();
  r.untilAttacks(1);
  r.battle.units = [];
  r.battle.remaining.bowler = 0;
  expect(bowlerImpactArtNeeded(r.battle)).toEqual(['trollBoulder_destroyed_lvl8']);
  setup.army.bowler = 0;
  expect(replayBattle(setup).nativeBowlerImpactArt).toBeUndefined();
  const g = garrisonBowlerImpactRecording(160);
  expect(bowlerImpactArtNeeded(g.snapshots[0].battle)).toEqual([]);
  expect(garrisonBowlerImpactEvents(g.snapshots.at(-1)!.battle, iso)).toEqual([]);
});

for (const version of [160, 161])
  it(`the level-one original boulder fixture reproduces its full version-${version} states`, () => {
    const r = bowlerBouldersRecording(version, 1),
      model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of r.snapshots) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  });

it('a released second flight survives battle finish for the existing visual grace clock', async () => {
  const { presentationLive, presentationTime } = await import('../src/game/presentation-clock');
  const { nativeProjectilePack, nativeProjectileFlight } =
    await import('../src/game/native-projectile-poses');
  const r = attackingBowlerBattle();
  r.untilAttacks(1);
  while (!r.battle.nativeBowlerFlights!.some((p) => p.native?.bounce === 1)) r.step();
  const shot = r.battle.nativeBowlerFlights!.find((p) => p.native?.bounce === 1)!,
    hp = r.battle.buildings.map((b) => b.hp);
  expect(presentationLive(r.battle, 0)).toBe(true);
  r.model.finishBattle();
  expect(r.battle.projectiles).toEqual([]);
  expect(r.battle.nativeBowlerFlights).toContain(shot);
  expect(presentationLive(r.battle, 0)).toBe(true);
  const at = presentationTime(r.battle, 1000),
    pack = JSON.parse(readFileSync('public/' + nativeProjectilePack(shot.native!.name), 'utf8'));
  expect(at).toBeGreaterThan(shot.impact);
  expect(
    nativeProjectileFlight(pack.projectiles[shot.native!.name], shot, at, { iso, airLift: 46 }).end,
  ).toBeCloseTo(shot.impact, 8);
  expect(r.battle.buildings.map((b) => b.hp)).toEqual(hp);
});
