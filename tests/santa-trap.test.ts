import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, makeNpcBuilding, type Unit } from '../src/game/model';
import { BUILDINGS, trapDamage } from '../src/game/data';
import {
  nativeBuildings,
  nativeScenery,
  nativeCampaignIssues,
  nativeUnlocked,
  NATIVE_CAMPAIGN,
} from '../src/game/native-campaign';
import { battleTrapStats, stepTraps } from '../src/game/traps';
import { SANTA_TRAP, SANTA_SPELL, makeSantaState } from '../src/game/santa-trap';
import { spawnSkeleton } from '../src/game/defenders';
import { validateReplay, REPLAY_VERSION } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateSave } from '../src/game/save';
import { santaBattle } from './fixtures/santa-battle';

function arena() {
  const m = new GameModel();
  m.startBattle(0);
  m.discardRecording();
  const b = m.battle!,
    trap = makeNpcBuilding(9000, 'santa-trap', 10, 10);
  b.buildings = [trap, makeBuilding(9001, 'townhall', 30, 30)];
  b.started = true;
  const unit = (x = 10.5, kind: Unit['kind'] = 'giant') => {
    const u: Unit = {
      id: 10000 + b.units.length,
      kind,
      x,
      y: 10.5,
      hp: 5000,
      maxHp: 5000,
      cooldown: 100,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
    };
    b.units.push(u);
    return u;
  };
  const step = (time = b.elapsed) => {
    b.elapsed = time;
    return stepTraps(b, 0.05, m.onEffect);
  };
  return { m, b, trap, unit, step };
}
describe('native Santa Trap', () => {
  it('preserves the hidden map entity and unlocks the first fifty-one villages without changing home Bombs', () => {
    expect(nativeCampaignIssues(37)).toEqual([]);
    expect(nativeBuildings(37).find((b) => b.npc === 'santa-trap')).toMatchObject({
      kind: 'bomb',
      x: 36,
      y: 29,
      level: 1,
      hp: 1,
    });
    expect(nativeScenery(37).find((o) => o.data === 18000033)).toMatchObject({ x: 36, y: 29 });
    const stars = Array(90).fill(0);
    for (let pass = 0; pass < 90; pass++)
      for (let i = 0; i < 90; i++)
        if (!nativeCampaignIssues(i).length && nativeUnlocked(i, stars)) stars[i] = 1;
    expect(stars.flatMap((s, i) => (s ? [i] : []))).toEqual(
      Array.from({ length: 51 }, (_, i) => i),
    );
    expect(NATIVE_CAMPAIGN[37].name).toBe('Goblin Picnic');
    expect(battleTrapStats(makeNpcBuilding(1, 'santa-trap', 1, 1))).toMatchObject(SANTA_TRAP);
    expect(trapDamage('bomb', 1)).toBe(20);
    expect(Object.hasOwn(BUILDINGS, 'santa-trap')).toBe(false);
  });
  it('conceals the passable trap, ignores direct damage, and activates only for live ground troops within 1.5 tiles', () => {
    const { m, b, trap, unit, step } = arena();
    expect(m.visibleBuilding(trap)).toBe(false);
    expect(m.deployBlocked(10.5, 10.5)).toBe(false);
    m.damage(trap, 1e6);
    expect(trap.hp).toBe(1);
    const air = unit(10.5, 'dragon'),
      dead = unit(),
      target = unit(12.001);
    dead.hp = 0;
    step();
    expect(b.traps[trap.id]).toBeUndefined();
    target.x = 12;
    step();
    expect(b.traps[trap.id]).toMatchObject({ targetId: target.id, resolved: false });
    expect(m.visibleBuilding(trap)).toBe(true);
    expect([air.hp, target.hp]).toEqual([5000, 5000]);
    step(SANTA_TRAP.delay);
    expect([air.hp, target.hp]).toEqual([5000, 5000]);
  });
  it('lands exactly five independent 180-damage hits on both attacking layers at the called spell times', () => {
    const { b, trap, unit, step } = arena();
    const ground = unit(),
      air = unit(10.5, 'balloon');
    const defender = spawnSkeleton(b, makeBuilding(9999, 'skeletontrap', 10, 10), 0, 0);
    step(0.05);
    const state = b.traps[trap.id];
    expect(state.santa!.castAt).toBeCloseTo(0.05 + 44 / 24, 10);
    for (let i = 0; i < 5; i++) {
      const strike = state.santa!.strikes[i];
      expect(strike.dropAt).toBeCloseTo(0.05 + 44 / 24 + 4.5 + i * 0.1, 10);
      expect(strike.hitAt).toBeCloseTo(0.05 + 44 / 24 + 6 + i * 0.1, 10);
      step(strike.hitAt - 0.000001);
      expect([ground.hp, air.hp]).toEqual([5000 - i * 180, 5000 - i * 180]);
      step(strike.hitAt);
      expect([ground.hp, air.hp]).toEqual([5000 - (i + 1) * 180, 5000 - (i + 1) * 180]);
      step(strike.hitAt);
      expect(state.santa!.hits).toBe(i + 1);
    }
    expect(state.resolved).toBe(true);
    expect(defender.hp).toBe(30);
    expect(b.buildings.every((v) => v.hp === v.maxHp)).toBe(true);
    step(20);
    expect(ground.hp).toBe(4100);
  });
  it('keeps strike points fixed after target death, ignores escapes and future spawns, and catches up once across a wide step', () => {
    const { b, trap, unit, step } = arena(),
      trigger = unit();
    step();
    const state = b.traps[trap.id],
      snapshot = structuredClone(state.santa!.strikes);
    trigger.hp = 0;
    trigger.x = 30;
    const escaped = unit(30),
      air = unit(10.5, 'dragon'),
      late = unit(),
      unborn = unit(),
      ejected = unit();
    late.spawnedAt = snapshot[2].hitAt + 0.001;
    unborn.spawnedAt = snapshot[4].hitAt + 0.001;
    ejected.ejected = true;
    step(10);
    expect([trigger.hp, escaped.hp, air.hp, late.hp, unborn.hp, ejected.hp]).toEqual([
      0, 5000, 4100, 4640, 5000, 5000,
    ]);
    expect(state.santa!.strikes).toEqual(snapshot);
    expect(state.santa!.hits).toBe(5);
    step(10);
    expect(late.hp).toBe(4640);
  });
  it('uses a circular 1.5-tile impact boundary for each fixed point', () => {
    const { b, trap, unit, step } = arena();
    unit();
    step();
    const strike = b.traps[trap.id].santa!.strikes[0],
      edge = unit(),
      outside = unit();
    edge.x = strike.x + 1.5;
    edge.y = strike.y;
    outside.x = strike.x + 1.50001;
    outside.y = strike.y;
    step(strike.hitAt);
    expect([edge.hp, outside.hp]).toEqual([4820, 5000]);
  });
  it('uses reproducible local scatter within one tile without depending on later simulation RNG calls', () => {
    const state = { activatedAt: 0.05, resolved: false, targetId: 1, x: 10.5, y: 10.5 };
    const a = makeSantaState(state, 10, 123);
    expect(makeSantaState(state, 10, 123)).toEqual(a);
    expect(makeSantaState(state, 11, 123)).not.toEqual(a);
    expect(makeSantaState(state, 10, 124)).not.toEqual(a);
    expect(new Set(a.strikes.map((s) => `${s.x},${s.y}`)).size).toBe(5);
    expect(
      a.strikes.every((s) => Math.hypot(s.x - state.x, s.y - state.y) <= SANTA_SPELL.scatter),
    ).toBe(true);
  });
  it('cancels pending hits when a battle ends', () => {
    const { m, b, trap, unit, step } = arena(),
      target = unit();
    step();
    m.finishBattle();
    expect(step(10)).toBe(false);
    expect(target.hp).toBe(5000);
    expect(b.traps[trap.id].santa!.hits).toBe(0);
  });
  it('reconstructs the intact Goblin Picnic attack, every hit and all rewind states through a portable replay', () => {
    const m = santaBattle(),
      b = m.battle!,
      trap = b.buildings.find((v) => v.npc === 'santa-trap')!;
    for (let i = 0; i < 260; i++) m.step(0.05);
    expect(b.units[0]).toMatchObject({ hp: 2100, maxHp: 3000 });
    expect(b.traps[trap.id]).toMatchObject({ resolved: true, santa: { hits: 5 } });
    m.finishBattle();
    const final = structuredClone(b),
      record = m.state.raidLog![0].replay!;
    expect(record.version).toBe(REPLAY_VERSION);
    expect(validateReplay(record)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    const replay = parseReplayFile(JSON.stringify(makeReplayFile(record)));
    m.returnHome();
    const home = structuredClone(m.state);
    m.openReplay(replay);
    const seek = (time: number) => {
      m.seekReplay(time);
      for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
      expect(m.replay!.seeking).toBe(false);
      return structuredClone(m.battle);
    };
    expect(seek(1e6)).toEqual(final);
    for (const time of [1, 2, 6.4, 7.9, 8, 8.1, 8.2, 8.3, 10]) {
      const before = seek(time);
      expect(seek(0)!.traps).toEqual({});
      expect(seek(time)).toEqual(before);
    }
    expect(seek(1e6)).toEqual(final);
    expect(m.state).toEqual(home);
  });
  it('rejects seasonal trap identity in home saves, practice, wrong archetypes and earlier replay schemas', () => {
    const m = santaBattle();
    m.finishBattle();
    const record = m.state.raidLog![0].replay!;
    for (const mutate of [
      (r: typeof record) => {
        r.version = 29;
      },
      (r: typeof record) => {
        r.initial.practice = true;
      },
      (r: typeof record) => {
        r.initial.buildings.find((v) => v.npc === 'santa-trap')!.level = 2;
      },
      (r: typeof record) => {
        r.initial.buildings.find((v) => v.npc === 'santa-trap')!.kind = 'giantbomb';
      },
    ]) {
      const r = structuredClone(record);
      mutate(r);
      expect(validateReplay(r)).toBe(false);
    }
    const home = new GameModel();
    home.state.buildings.push(makeNpcBuilding(home.state.nextId++, 'santa-trap', 2, 2));
    expect(validateSave(home.state)).toBe(false);
  });
});
