import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { GameModel, makeBuilding } from '../src/game/model';
import { castNativeSpell, stepNativeSpells } from '../src/game/native-spells';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { replayBattle } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { flameFlingerBurnBattle } from './fixtures/flame-flinger-wall-burn';
import { flameFlingerOverlapRecording } from './fixtures/flame-flinger-overlap';

for (const level of [1, 2, 3, 4, 5])
  it(`two real level ${level} pools share their maximum sustained building damage`, () => {
    const r = flameFlingerBurnBattle(level, 227);
    r.untilAttacks(2);
    r.unit.hp = 0;
    while ((r.battle.nativeSpells?.filter((c) => c.name === 'FireSpiritExplosion').length ?? 0) < 2)
      r.step();
    const pools = r.battle.nativeSpells!.filter((c) => c.name === 'FireSpiritExplosion');
    r.until(pools[1].firstHit + 5.05);
    const wall = r.battle.buildings.find((b) => b.id === 3)!,
      storage = r.battle.buildings.find((b) => b.id === 4)!,
      before = { at: r.battle.elapsed, wall: wall.hp, storage: storage.hp },
      dps = [80, 95, 105, 120, 130][level - 1];
    r.until(before.at + 0.4);
    expect(before.storage - storage.hp).toBeCloseTo(2 + dps * 0.4, 7);
    expect(before.wall - wall.hp).toBeCloseTo(50 + dps * 0.4, 7);
  });

for (const level of [1, 2, 3, 4, 5])
  it(`a single level ${level} pool retains version226 damage throughout its full lifetime`, () => {
    const run = (version: number) => {
      const r = flameFlingerBurnBattle(level, version);
      r.untilAttacks(1);
      r.unit.hp = 0;
      r.until(33);
      return r.battle.buildings.map((b) => ({ id: b.id, hp: b.hp }));
    };
    const old = run(226),
      current = run(227);
    expect(current.map((b) => b.id)).toEqual(old.map((b) => b.id));
    for (let i = 0; i < old.length; i++) expect(current[i].hp).toBeCloseTo(old[i].hp, 8);
  });

function fields(
  times: number[],
  offsets: number[],
  reversed = false,
  levels = offsets.map(() => 1),
  version = 227,
) {
  const r = flameFlingerBurnBattle(1, version),
    wall = makeBuilding(20, 'wall', 10, 10, 18),
    storage = makeBuilding(21, 'goldstorage', 10, 10, 18);
  r.battle.buildings = [wall, storage];
  for (const b of r.battle.buildings) b.hp = b.maxHp = 100000;
  const ground = spawnGarrisonDefender(r.battle, 'golem', 8, 1, 10, 10, 0);
  ground.hp = ground.maxHp = 100000;
  for (let i = 0; i < offsets.length; i++)
    castNativeSpell(r.battle, 'FireSpiritExplosion', levels[i], 'attack', 10, 10, {
      at: offsets[i],
      immediate: true,
    });
  if (reversed) r.battle.nativeSpells!.reverse();
  const effects: unknown[] = [];
  for (const at of times) {
    r.battle.elapsed = at;
    stepNativeSpells({
      battle: r.battle,
      damageBuilding: (b, d) => {
        b.hp = Math.max(0, b.hp - d);
      },
      effect: (e) => effects.push(e),
    });
  }
  return {
    wall: wall.hp,
    storage: storage.hp,
    ground: ground.hp,
    buildingEffects: r.battle.buildingEffects,
    defenderPoison: ground.poison,
    casts: r.battle.nativeSpells?.slice().sort((a, b) => a.id - b.id),
    effects,
  };
}

for (const offsets of [
  [0, 0, 0],
  [0, 0.128, 0.256],
  [0, 0.05, 0.31],
])
  it(`overlap resolves physical chronology for ${offsets.join('/')} across cast order and step sizes`, () => {
    const fine = Array.from({ length: 128 }, (_, i) => (i + 1) * 0.05),
      expected = fields(fine, offsets);
    expect(fields([6.4], offsets)).toEqual(expected);
    expect(fields([0.73, 1.9, 4.17, 6.4], offsets, true)).toEqual(expected);
  });

it('mixed-strength areas share the stronger cap and retain independent flat Wall pulses', () => {
  const before = fields([6], [0, 0.128], false, [1, 5]),
    after = fields([6.4], [0, 0.128], false, [1, 5]);
  expect(before.storage - after.storage).toBeCloseTo(2 + 130 * 0.4, 7);
  expect(before.wall - after.wall).toBeCloseTo(50 + 130 * 0.4, 7);
});

it('an expired stronger poison does not survive a fresh area after its exposure decay', () => {
  const r = flameFlingerBurnBattle(1, 227),
    wall = makeBuilding(20, 'wall', 10, 10, 18);
  r.battle.buildings = [wall];
  const first = castNativeSpell(r.battle, 'FireSpiritExplosion', 5, 'attack', 10, 10, {
    immediate: true,
  });
  first.total = 2;
  const pulse = (at: number) => {
    r.battle.elapsed = at;
    stepNativeSpells({
      battle: r.battle,
      damageBuilding: (b, d) => {
        b.hp -= d;
      },
      effect: () => {},
    });
  };
  pulse(0.9);
  const next = castNativeSpell(r.battle, 'FireSpiritExplosion', 1, 'attack', 10, 10, {
      at: 8,
      immediate: true,
    }),
    hp = wall.hp;
  pulse(next.firstHit);
  expect(hp - wall.hp).toBeCloseTo(27.56, 8);
  expect(r.battle.buildingEffects![wall.id].flameBurn!.damage!.dps).toBe(80);
});

for (const version of [226, 227])
  for (const level of [1, 5])
    for (const x of [5, 11.4])
      it(`Flame Flinger overlap ${level} from${x} reconstructs complete version${version} portable states`, () => {
        const r = flameFlingerOverlapRecording(level, version, x),
          viewer = new GameModel();
        if (version === 226) {
          const hashes: Record<string, string> = {
            '1:5': '5503af45f2c88323cfc68b6c7ac76568302da24982c2d127baf6aa09c2c3f1a8',
            '1:11.4': '85cf66d3014c40a9ef53bc6c1c201332422f3cbb4f64f04b24072d73bc4868ce',
            '5:5': 'ebe890d763cb9b875c310184771ecee8453ebc95373e898faf8be3d90e183c21',
            '5:11.4': '176405283f454c05f8712c7891c78554aa5f713164089d6a1eff5649554ce429',
          };
          expect(createHash('sha256').update(JSON.stringify(r.snapshots)).digest('hex')).toBe(
            hashes[`${level}:${x}`],
          );
        }
        expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(
          true,
        );
        for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
          viewer.seekReplay(snapshot.at);
          while (viewer.replay!.seeking) viewer.step(0.05);
          expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
        }
      });

it('only new carried Flame Flinger armies enable shared building burn damage', () => {
  const r = flameFlingerBurnBattle(1, 226);
  expect(r.battle.nativeFlameFlingerBurnOverlap).toBeUndefined();
  expect(replayBattle(r.data.initial, 227).nativeFlameFlingerBurnOverlap).toBe(true);
  r.data.initial.army.flameflinger = 0;
  expect(replayBattle(r.data.initial, 227).nativeFlameFlingerBurnOverlap).toBeUndefined();
});
