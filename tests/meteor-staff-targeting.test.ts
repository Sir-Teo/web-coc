import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { heroAbilities } from '../src/game/native-heroes';
import { seconds } from '../src/game/native-data';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { meteorStaffBattle, meteorStaffRecording } from './fixtures/meteor-staff';

const meteors = (b: Battle) => b.nativeSpells?.filter((c) => c.name === 'MPMeteorStaffSpell') ?? [];
const hold = (r: ReturnType<typeof meteorStaffBattle>) => {
  r.unit.native!.effects = { frozenUntil: 100 };
  return r;
};

it.each(['invisibility', 'overgrowth', 'tesla'] as const)(
  'Meteor Staff skips a defense concealed by %s and selects a visible ordinary building',
  (mode) => {
    const r = hold(meteorStaffBattle());
    if (mode === 'tesla') r.battle.buildings[1] = makeBuilding(2, 'tesla', 30, 10, 1);
    else
      r.battle.buildingEffects = {
        2: mode === 'invisibility' ? { invisibleUntil: 100 } : { overgrownUntil: 100 },
      };
    r.until(10.05);
    expect(meteors(r.battle)).toHaveLength(1);
    expect(meteors(r.battle)[0]).toMatchObject({ x: 38, y: 38 });
  },
);

it('Meteor Staff falls back to the nearest ordinary building with no defenses, at every source item tier', () => {
  const tiers = [
    [1, 10, 250],
    [3, 9.5, 300],
    [6, 9, 350],
    [9, 8.5, 400],
    [12, 8, 450],
    [15, 7.5, 500],
    [18, 7, 575],
    [21, 6.5, 650],
    [24, 6, 750],
    [27, 5, 850],
  ];
  for (let level = 1; level <= 27; level++) {
    const [, cooldown, damage] = tiers.filter(([start]) => start <= level).at(-1)!;
    const r = hold(meteorStaffBattle(level, undefined, true));
    const ability = heroAbilities(r.hero).find((a) => a.name === 'MPMeteorStaff')!;
    expect(seconds(ability.row, 'ActivationCooldown')).toBe(cooldown);
    r.until(cooldown - 0.05);
    expect(meteors(r.battle)).toEqual([]);
    r.until(cooldown + 0.05);
    const cast = meteors(r.battle)[0];
    expect(cast).toMatchObject({ x: 14.5, y: 11.5, level: ability.level });
    expect(cast.firstHit - cast.castAt).toBeCloseTo(1.1, 10);
    const target = r.battle.buildings[1],
      hp = target.hp;
    r.until(cast.firstHit - 0.05);
    expect(target.hp).toBe(hp);
    r.until(cast.firstHit + 0.05);
    expect(hp - target.hp).toBe(damage);
  }
});

it('prefers a visible defense at any distance over a closer resource building, using stable footprint ties', () => {
  const r = hold(meteorStaffBattle());
  r.battle.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(4, 'cannon', 30, 10, 21),
    makeBuilding(3, 'elixirstorage', 8, 15, 14),
    makeBuilding(2, 'cannon', 30, 11, 21),
  ];
  r.until(10.05);
  expect(meteors(r.battle)[0]).toMatchObject({ x: 31.5, y: 12.5 });
});

it('does not cast at walls, traps or hidden buildings, and retries when an ordinary target becomes visible', () => {
  const r = hold(meteorStaffBattle());
  r.battle.buildings.push(makeBuilding(3, 'wall', 8, 10, 1), makeBuilding(4, 'bomb', 8, 12, 1));
  r.battle.buildingEffects = { 1: { invisibleUntil: 100 }, 2: { overgrownUntil: 100 } };
  r.until(10.05);
  expect(meteors(r.battle)).toEqual([]);
  delete r.battle.buildingEffects[1];
  r.model.step(0.05);
  expect(meteors(r.battle)[0]).toMatchObject({ x: 38, y: 38 });
});

it('counts an awakened Town Hall as a defense and preserves ordinary visible-defense combat against version 140', () => {
  const r = hold(meteorStaffBattle());
  r.battle.buildings[0] = makeBuilding(1, 'townhall', 36, 36, 12);
  r.battle.buildings[1] = makeBuilding(2, 'elixirstorage', 13, 10, 14);
  (r.battle.nativeDefenses ??= {})[1] = { clock: 0, readyAt: 0, awakeAt: 0 };
  r.until(10.05);
  expect(meteors(r.battle)[0]).toMatchObject({ x: 38, y: 38 });
  for (const level of [1, 27]) {
    const current = hold(meteorStaffBattle(level)),
      old = hold(meteorStaffBattle(level, 140));
    current.until(11.2);
    old.until(11.2);
    const comparable = JSON.parse(JSON.stringify(current.battle));
    delete comparable.nativeMeteorStaffTargeting;
    expect(comparable).toEqual(old.battle);
  }
});

for (const hidden of [false, true])
  it(`real Meteor Staff recording targets correctly through portable forward/backward seeks, invisible defense=${hidden}`, () => {
    const r = meteorStaffRecording(hidden);
    if (hidden) {
      const before = r.snapshots.find((s) => s.at === r.beforeCast)!.battle as Battle;
      expect(before.buildingEffects![2].invisibleUntil).toBeGreaterThan(before.elapsed);
      expect(meteors(before)).toEqual([]);
    }
    const castState = r.snapshots.find((s) => s.at === r.cast)!.battle as Battle;
    expect(meteors(castState)).toHaveLength(1);
    expect(meteors(castState)[0]).toMatchObject(hidden ? { x: 38, y: 38 } : { x: 14.5, y: 11.5 });
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const s of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
      model.seekReplay(s.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(s.battle);
    }
    const old = meteorStaffRecording(hidden, 140),
      oldState = old.snapshots.find((s) => s.at === old.cast)!.battle as Battle;
    if (hidden) expect(meteors(oldState)[0]).toMatchObject({ x: 14.5, y: 11.5 });
    else expect(meteors(oldState)).toEqual([]);
  });
