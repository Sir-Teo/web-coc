import { describe, expect, it } from 'vitest';
import native from '../reference/late-goblin-buildings/native.json';
import { NATIVE_CAMPAIGN, NATIVE_COMBAT, nativeLayout } from '../src/game/native-campaign';
import { NPC_BUILDINGS } from '../src/game/npc-buildings';
import { makeBuilding, makeNpcBuilding, type Building } from '../src/game/model';
import {
  GOBLIN_WEAPONS,
  goblinBuildingArt,
  isLateGoblinIdentity,
} from '../src/game/late-goblin-buildings-stats';
import { lateActivatedDefense } from '../src/game/late-campaign';
import { lateGoblinBuildingsPending } from '../src/game/late-goblin-buildings';
import { goblinHallFrame } from '../src/game/late-goblin-buildings-poses';
import { weaponTickTime } from '../src/game/late-goblin-weapon';
import { replayBattle, validateReplay } from '../src/game/replay';
import { lateGoblinLive, lateGoblinReplay } from './fixtures/late-goblin-battle';

const hall2 = () => makeNpcBuilding(1000, 'goblin-hall', 20, 20, 2);

describe('late Goblin campaign building source', () => {
  it('preserves the pinned rows, weapon references and campaign placements', () => {
    for (const [npc, id, hp] of [
      ['comm-mast', 1000016, [250]],
      ['goblin-hall', 1000017, [750, 7500]],
      ['goblin-castle', 1000061, [4000]],
      ['foreboding-cave', 1000062, [25000]],
      ['goblin-boss-th', 1000069, [50000]],
    ] as const) {
      expect(NATIVE_COMBAT[id].hp).toEqual(hp);
      expect(NPC_BUILDINGS[npc].hp).toEqual(hp);
    }
    expect(GOBLIN_WEAPONS['goblin-hall']).toMatchObject({
      level: 2,
      range: 10,
      intervalMs: 200,
      damage: 30,
      slots: 3,
      air: true,
      ground: true,
      splash: 0,
      projectileSpeed: 18,
      tracking: true,
      activateOnDamage: true,
      activationDelay: 0.5,
    });
    expect(GOBLIN_WEAPONS['goblin-boss-th']).toMatchObject({
      level: 1,
      range: 11,
      intervalMs: 1100,
      damage: 330,
      slots: 1,
      air: false,
      ground: true,
      splash: 1,
      projectileSpeed: 8,
      tracking: false,
      activateOnDamage: false,
      activationDelay: 0.5,
    });
    // The level-2 row still carries older inline Tesla fields; the Weapon reference supplies combat.
    expect(native.buildings['Goblin Hall'][1]).toMatchObject({
      DPS: '120',
      AttackSpeed: '500',
      HitEffect: 'Tesla Hit',
      Weapon: 'GoblinTh02',
    });
    expect(NATIVE_COMBAT[1000017].dps).toEqual([0, 120]);
    expect(native.buildings['Goblin Boss TH'][0].ExportName).toBe('goblin_clancastle_01');
    expect(goblinBuildingArt('goblin-boss-th', 1).body).toBe('goblin_th02');
    expect(goblinBuildingArt('goblin-hall', 1).body).toBe('goblin_townhall_lvl1');
    const usage = new Map<string, number[]>();
    NATIVE_CAMPAIGN.forEach((_, index) => {
      for (const b of nativeLayout(index))
        if (isLateGoblinIdentity(b.npc)) {
          const key = `${b.npc}:${b.level}`;
          const list = usage.get(key) ?? [];
          if (!list.includes(index)) list.push(index);
          usage.set(key, list);
        }
    });
    expect(Object.fromEntries(usage)).toEqual({
      'goblin-castle:1': [67, 69, 72, 76, 77, 83, 89],
      'goblin-hall:1': [67],
      'goblin-hall:2': [71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88],
      'comm-mast:1': [73, 75, 76, 78, 79, 80, 81, 83, 85, 88],
      'foreboding-cave:1': [74],
      'goblin-boss-th:1': [89],
    });
  });

  it('holds deactive frames, plays active start once and loops active idle', () => {
    expect(goblinHallFrame(undefined, 12, false)).toBe(0);
    expect(goblinHallFrame(3, 2.9, false)).toBe(0);
    expect(goblinHallFrame(3, 3, false)).toBe(2);
    expect(goblinHallFrame(3, 3 + 12 / 24, false)).toBe(14);
    expect(goblinHallFrame(3, 3 + 33 / 24, false)).toBe(35);
    expect(goblinHallFrame(3, 3 + 66 / 24, false)).toBe(35);
    expect(goblinHallFrame(3, 3.01, true)).toBe(35);
  });
});

describe('late Goblin campaign building combat', () => {
  it('keeps the level-1 Goblin Hall passive while it is destroyed', () => {
    const hall = makeNpcBuilding(1000, 'goblin-hall', 20, 20, 1);
    const model = lateGoblinLive(
      lateGoblinReplay(67, [{ step: 0, kind: 'pekka', x: 17, y: 22 }], {
        buildings: [hall],
        steps: 400,
        scenery: false,
      }),
    );
    expect(model.battle!.buildings[0].hp).toBe(0);
    expect(model.battle!.late!.goblinBuildings!.weapons).toEqual({});
    expect(model.battle!.late!.goblinBuildings!.destroyed[1000]).toBeGreaterThan(0);
  });

  it('wakes the level-2 Goblin Hall on damage and fires three distinct tracked arrows', () => {
    const data = lateGoblinReplay(
      73,
      [
        // Exactly three attackers, one flying, so the three distinct arrows include the air layer.
        { step: 0, kind: 'archer', x: 12, y: 22 },
        { step: 0, kind: 'archer', x: 12, y: 23 },
        { step: 0, kind: 'balloon', x: 13, y: 21 },
      ],
      { buildings: [hall2()], steps: 400, scenery: false },
    );
    const model = lateGoblinLive(data, 0);
    const b = model.battle!;
    let damagedAt: number | undefined;
    let inRangeBefore = false;
    for (let step = 0; step < 400 && damagedAt === undefined; step++) {
      model.step(0.05);
      const hall = b.buildings[0];
      if (hall.hp < hall.maxHp) damagedAt = b.elapsed;
      else {
        inRangeBefore ||= b.units.some((u) => Math.hypot(u.x - 22, u.y - 22) <= 10);
        expect(b.late!.goblinBuildings!.weapons[1000].activatedAt).toBeUndefined();
        expect(b.late!.goblinBuildings!.projectiles).toEqual([]);
      }
    }
    expect(inRangeBefore).toBe(true);
    const weapon = b.late!.goblinBuildings!.weapons[1000];
    expect(weapon.activatedAt).toBe(damagedAt);
    expect(weapon.readyAt).toBeCloseTo(damagedAt! + 0.5, 9);
    expect(lateActivatedDefense(b, b.buildings[0])).toBe(false);
    while (!weapon.shots.length) model.step(0.05);
    const ready = Math.ceil((weapon.readyAt! * 1000) / 64 - 1e-9);
    const first = weapon.shots.filter((s) => s.at === weapon.shots[0].at);
    expect(first[0].at).toBeCloseTo(weaponTickTime(ready + 3), 9);
    expect(new Set(first.map((s) => s.targetId)).size).toBe(3);
    expect(first.some((s) => s.toAir)).toBe(true);
    expect(lateActivatedDefense(b, b.buildings[0])).toBe(true);
    const hp = new Map(b.units.map((u) => [u.id, u.hp]));
    while (weapon.hits.length < 3) model.step(0.05);
    for (const hit of weapon.hits.slice(0, 3)) expect(hit.struck).toBe(1);
    const struck = first.map(
      (s) => hp.get(s.targetId)! - b.units.find((u) => u.id === s.targetId)!.hp,
    );
    for (const loss of struck) expect(loss).toBeGreaterThanOrEqual(30);
  });

  it('activates an undamaged Goblin Hall once destruction passes half', () => {
    const masts = [0, 1, 2].map((i) => makeNpcBuilding(1001 + i, 'comm-mast', 8 + i * 3, 8));
    const model = lateGoblinLive(
      lateGoblinReplay(73, [{ step: 0, kind: 'pekka', x: 6, y: 6 }], {
        buildings: [{ ...hall2(), x: 36, y: 36 }, ...masts],
        steps: 600,
        scenery: false,
      }),
      0,
    );
    const b = model.battle!;
    for (
      let i = 0;
      i < 600 && b.late?.goblinBuildings?.weapons[1000]?.activatedAt === undefined;
      i++
    )
      model.step(0.05);
    expect(b.destruction).toBeGreaterThan(50);
    expect(b.buildings[0].hp).toBe(b.buildings[0].maxHp);
    expect(b.late!.goblinBuildings!.weapons[1000].activatedAt).toBe(b.elapsed);
  });

  it('throws Boss Town Hall bombs from combat start at ground troops only, with splash', () => {
    const boss = makeNpcBuilding(1000, 'goblin-boss-th', 20, 20, 1);
    const model = lateGoblinLive(
      lateGoblinReplay(
        89,
        [
          ...[0, 1, 2].map((i) => ({ step: 0, kind: 'giant' as const, x: 16, y: 21 + i * 0.3 })),
          { step: 0, kind: 'balloon', x: 17, y: 25 },
        ],
        { buildings: [boss], steps: 200, scenery: false },
      ),
      0,
    );
    const b = model.battle!;
    model.step(0.05);
    const weapon = b.late!.goblinBuildings!.weapons[1000];
    expect([weapon.activatedAt, weapon.readyAt]).toEqual([0, 0.5]);
    while (!weapon.hits.length) model.step(0.05);
    // First tick at or after 500 ms is 512 ms; an 1,100 ms timer fires on the 18th tick.
    expect(weapon.shots[0].at).toBeCloseTo(weaponTickTime(8 + 17), 9);
    expect(weapon.shots.every((s) => !s.toAir)).toBe(true);
    const balloon = b.units.find((u) => u.kind === 'balloon')!;
    expect(balloon.hp).toBe(balloon.maxHp);
    // Straight sub-tile routes spread the Giants along the hall face; once they stand attacking
    // there, one bomb's one-tile splash strikes several of them.
    let splash = weapon.hits[0].struck;
    for (let i = 0; i < 120 && splash < 2; i++) {
      model.step(0.05);
      splash = Math.max(splash, ...weapon.hits.map((h) => h.struck));
    }
    expect(splash).toBeGreaterThan(1);
    expect(weapon.shots.every((s) => !s.toAir)).toBe(true);
  });

  it('draws defense-preferring troops to the Goblin Hall only once its weapon is ready', () => {
    // A nearer Gold Storage wins until the hall's ActivatedCombatAddBuildingClass applies.
    const storage = makeBuilding(1001, 'goldstorage', 8, 20, 1);
    const target = (giantStep: number) => {
      const model = lateGoblinLive(
        lateGoblinReplay(
          73,
          [
            { step: 0, kind: 'archer', x: 22, y: 17 },
            { step: giantStep, kind: 'giant', x: 5, y: 21.5 },
          ],
          { buildings: [hall2(), storage], steps: 200, scenery: false },
        ),
        giantStep + 2,
      );
      const b = model.battle!;
      return {
        ready: b.late!.goblinBuildings!.weapons[1000].readyAt,
        elapsed: b.elapsed,
        target: b.units.find((u) => u.kind === 'giant')!.target,
      };
    };
    const early = target(0);
    expect(early.ready).toBeUndefined();
    expect(early.target).toBe(1001);
    const late = target(120);
    expect(late.ready).toBeLessThan(late.elapsed - 0.1);
    expect(late.target).toBe(1000);
  });

  it('removes the Goblin Castle from resource preference', () => {
    const castle = makeNpcBuilding(1000, 'goblin-castle', 12, 12);
    const storage: Building = makeBuilding(1001, 'goldstorage', 30, 30, 1);
    const model = lateGoblinLive(
      lateGoblinReplay(67, [{ step: 0, kind: 'goblin', x: 10, y: 10 }], {
        buildings: [castle, storage],
        steps: 10,
        scenery: false,
      }),
    );
    expect(model.battle!.units[0].target).toBe(1001);
  });

  it('keeps in-flight hall projectiles pending before results', () => {
    const model = lateGoblinLive(
      lateGoblinReplay(73, [{ step: 0, kind: 'pekka', x: 17, y: 22 }], {
        buildings: [hall2(), makeBuilding(1001, 'goldstorage', 38, 38, 1)],
        steps: 1200,
        scenery: false,
      }),
      0,
    );
    const b = model.battle!;
    while (!b.late?.goblinBuildings?.projectiles.length) model.step(0.05);
    const flight = b.late.goblinBuildings.projectiles.at(-1)!;
    for (const unit of b.units) unit.hp = 0;
    let heldOpen = 0;
    while (!b.finished) {
      model.step(0.05);
      if (!b.finished) {
        expect(lateGoblinBuildingsPending(b)).toBe(true);
        heldOpen++;
      }
    }
    expect(heldOpen).toBeGreaterThan(0);
    expect(b.late.goblinBuildings.projectiles).toEqual([]);
    expect(b.elapsed + 1e-9).toBeGreaterThanOrEqual(flight.impact);
  });
});

describe('late Goblin campaign building replays', () => {
  it('rejects late Goblin identities before version 44 and keeps older battles inert', () => {
    const data = lateGoblinReplay(73, [{ step: 0, kind: 'giant', x: 12, y: 22 }], {
      buildings: [hall2()],
      steps: 20,
      scenery: false,
    });
    expect(validateReplay(data)).toBe(true);
    expect(validateReplay({ ...data, version: 43 })).toBe(false);
    expect(replayBattle(data.initial, 43).late).toBeUndefined();
    expect(replayBattle(data.initial, 44).late).toEqual({});
  });
});
