import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { NATIVE_COMBAT, nativeLayout } from '../src/game/native-campaign';
import {
  builderHutActivation,
  builderHutDefenseClass,
  campaignBuilderHut,
  deployedHousingSpace,
} from '../src/game/builder-hut';
import { BUILDER_HUT_LEVELS, builderHutWeapon } from '../src/game/builder-hut-stats';
import { builderHutFacing, builderHutPose } from '../src/game/builder-hut-poses';
import { weaponTickTime } from '../src/game/late-goblin-weapon';
import { lateCampaignIssues } from '../src/game/late-campaign';
import { replayBattle } from '../src/game/replay';
import { lateGoblinLive, lateGoblinReplay } from './fixtures/late-goblin-battle';

/** Campaign huts carry the source hitpoints; the home catalog keeps its own table. */
const hut = (id: number, x: number, y: number, level: number): Building => {
  const hp = NATIVE_COMBAT[1000015].hp[level - 1];
  return { ...makeBuilding(id, 'builder', x, y, level), hp, maxHp: hp };
};

describe("armed Builder's Hut source", () => {
  it('uses the pinned armed tiers, turret weapon and Defending Builder references', () => {
    expect(BUILDER_HUT_LEVELS.map((row) => row.hp)).toEqual(NATIVE_COMBAT[1000015].hp.slice(0, 4));
    expect(BUILDER_HUT_LEVELS.map((row) => row.body)).toEqual([
      'worker_building',
      'worker_building_armed_lvl1',
      'worker_building_armed_lvl2',
      'worker_building_armed_lvl3',
    ]);
    expect(builderHutWeapon(1)).toBeUndefined();
    expect([2, 3, 4].map((level) => builderHutWeapon(level)!.damage)).toEqual([32, 40, 48]);
    expect([2, 3, 4].map((level) => builderHutWeapon(level)!.projectile.export)).toEqual([
      'nail_ammo',
      'nail_ammo',
      'nail_ammo_2',
    ]);
    expect(builderHutWeapon(4)).toMatchObject({
      range: 7,
      intervalMs: 400,
      air: true,
      ground: true,
      projectileSpeed: 18,
      wakeUpSpace: 1,
      wakeUpMs: 1600,
    });
    expect(
      BUILDER_HUT_LEVELS.slice(1).map((row) => [row.defenceTroop, row.defenceTroopLevel]),
    ).toEqual([
      ['Defending Builder', 1],
      ['Defending Builder', 2],
      ['Defending Builder', 3],
    ]);
    const levels = new Map<number, Set<number>>();
    nativeLayout(84)
      .filter((b) => b.kind === 'builder' && !b.npc)
      .forEach((b) => levels.set(b.level, (levels.get(b.level) ?? new Set()).add(b.id)));
    expect([...levels.keys()].sort()).toEqual([1, 2, 3, 4]);
    // With the turret and its Defending Builder implemented, armed tiers no longer gate villages.
    expect(lateCampaignIssues([[1000015, 0, 0, 2]])).toEqual([]);
    expect(lateCampaignIssues([[1000015, 0, 0, 1]])).toEqual([]);
  });

  it('counts battle-log housing with the pinned troop, spell and hero multipliers', () => {
    const b = replayBattle(
      lateGoblinReplay(84, [], { buildings: [hut(1000, 20, 20, 4)], steps: 1, scenery: false })
        .initial,
    );
    expect(deployedHousingSpace(b)).toBe(0);
    b.carriedArmy.giant = 3;
    b.remaining.giant = 1;
    b.carried.lightning = 2;
    b.spells.lightning = 1;
    b.hero = { level: 1, townhall: 8, unitId: 7, abilityUsed: false, rageUntil: 0 };
    expect(deployedHousingSpace(b)).toBe(2 * 5 + 1 * 5 + 25);
  });
});

describe("armed Builder's Hut combat", () => {
  it('wakes on the first deployment tick, fires after WakeUpSpeed and hits ground and air', () => {
    const model = lateGoblinLive(
      lateGoblinReplay(
        84,
        [
          { step: 0, kind: 'giant', x: 16, y: 21 },
          { step: 0, kind: 'balloon', x: 21, y: 16 },
        ],
        { buildings: [hut(1000, 20, 20, 4)], steps: 200, scenery: false },
      ),
      0,
    );
    const b = model.battle!;
    model.step(0.05);
    expect(b.late!.builderHut!.huts[1000].wakeAt).toBeUndefined();
    model.step(0.05);
    const state = b.late!.builderHut!.huts[1000];
    expect(state.wakeAt).toBeCloseTo(0.064, 9);
    expect(state.readyAt).toBeCloseTo(1.6, 9);
    expect(builderHutDefenseClass(b, b.buildings[0])).toBe(false);
    while (b.elapsed < 1.95) {
      model.step(0.05);
      expect(state.shots).toEqual([]);
    }
    model.step(0.05);
    // Ready on tick 25; a 400-ms hit timer fires on its seventh 64-ms tick.
    expect(state.shots[0].at).toBeCloseTo(weaponTickTime(31), 9);
    expect(builderHutDefenseClass(b, b.buildings[0])).toBe(true);
    while (state.fired < 6 && !b.finished) model.step(0.05);
    for (let i = 0; i < 80 && !b.finished; i++) model.step(0.05);
    const giant = b.units.find((u) => u.kind === 'giant')!,
      balloon = b.units.find((u) => u.kind === 'balloon')!;
    expect(giant.hp < giant.maxHp || balloon.hp < balloon.maxHp).toBe(true);
    expect(
      [giant.maxHp - giant.hp, balloon.maxHp - balloon.hp].every(
        (loss) => loss % 48 === 0 || loss > 48,
      ),
    ).toBe(true);
    expect(builderHutActivation(b, b.buildings[0])).toMatchObject({
      level: 4,
      wakeAt: state.wakeAt,
      readyAt: state.readyAt,
    });
  });

  it('keeps level-one campaign huts, home huts and version-43 battles passive', () => {
    const data = lateGoblinReplay(84, [{ step: 0, kind: 'giant', x: 16, y: 21 }], {
      buildings: [hut(1000, 20, 20, 1), hut(1001, 23, 20, 4)],
      steps: 120,
      scenery: false,
    });
    const live = lateGoblinLive(data);
    expect(live.battle!.late!.builderHut!.huts[1000]).toBeUndefined();
    expect(live.battle!.late!.builderHut!.huts[1001].fired).toBeGreaterThan(0);
    const old = lateGoblinLive({ ...data, version: 43 });
    expect(old.battle!.late).toBeUndefined();
    const giant = old.battle!.units.find((u) => u.kind === 'giant')!;
    expect(giant.hp).toBe(giant.maxHp);
    const home = new GameModel();
    home.state.buildings.push(hut(9000, 30, 30, 4));
    home.state.army.giant = 1;
    home.startBattle(0, true);
    expect(home.battle!.late).toBeUndefined();
    expect(campaignBuilderHut(home.battle, home.state.buildings.at(-1)!)).toBe(false);
  });
});

describe("armed Builder's Hut presentation state", () => {
  it('reconstructs dormant, waking, active and ruin poses from battle history', () => {
    const data = lateGoblinReplay(84, [{ step: 0, kind: 'giant', x: 16, y: 21 }], {
      buildings: [hut(1000, 20, 20, 3)],
      steps: 60,
      scenery: false,
    });
    const b = replayBattle(data.initial);
    const building = b.buildings[0];
    expect(builderHutPose(building, b, 0, false).state).toBe('dormant');
    b.late!.builderHut = {
      huts: {
        1000: {
          wakeAt: 0.064,
          readyAt: 1.6,
          nextTick: 30,
          slot: { targetId: null, chargeMs: 0 },
          fired: 0,
          aimX: -1,
          aimY: 0,
          shots: [],
          hits: [],
        },
      },
      projectiles: [],
      destroyed: {},
    };
    expect(builderHutPose(building, b, 0.5, false)).toMatchObject({ state: 'waking', load: 11 });
    expect(builderHutPose(building, b, 1.59, false).load).toBe(37);
    expect(builderHutPose(building, b, 1.6, false)).toMatchObject({
      state: 'active',
      load: 38,
      turret: 185,
    });
    expect(builderHutFacing(1, 0)).toBe(5);
    expect(builderHutFacing(0, 1)).toBe(95);
    b.late!.builderHut.destroyed[1000] = 3;
    const ruined = { ...building, hp: 0 };
    expect(builderHutPose(ruined, b, 3, false)).toMatchObject({ state: 'ruin', ruin: 0 });
    expect(builderHutPose(ruined, b, 9, false).ruin).toBe(5);
  });
});
