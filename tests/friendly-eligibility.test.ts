import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { TROOP_KEYS } from '../src/game/data';
import { isSiege } from '../src/game/special-troops';
import { nativeUnitStats } from '../src/game/native-units';
import {
  initialNativeState,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { prepareHealerTargets, stepHealer } from '../src/game/healing';
import { healUnit, unitDamageScale } from '../src/game/native-status';
import { launchProjectile, stepProjectiles } from '../src/game/projectiles';
import { refreshHeroPassives } from '../src/game/native-hero-abilities';
import { nativeFriendlyRecording } from './fixtures/native-friendly';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  battle.started = true;
  let id = 1000;
  const unit = (kind: Unit['kind'], x = 5, y = 5) => {
    const stats = nativeUnitStats(kind, 1);
    const result: Unit = {
      id: id++,
      kind,
      level: 1,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      native: initialNativeState(kind, 1),
    };
    battle.units.push(result);
    return result;
  };
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => id++,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp -= amount;
    },
    effect() {},
  };
  return { model, battle, unit, ctx };
}

it.each(TROOP_KEYS.filter(isSiege))(
  'respects %s native healing immunity across shared recovery',
  (kind) => {
    for (const version of [95, 96]) {
      const { battle, unit } = arena(version);
      const siege = unit(kind);
      expect(siege.native!.noHealing).toBe(true);
      siege.hp = siege.maxHp - 100;
      expect(healUnit(battle, siege, 100)).toBe(version >= 96 ? 0 : 100);
    }
  },
);

it('keeps a Healer from locking onto a siege, and preserves version 95 selection', () => {
  for (const version of [95, 96]) {
    const { battle, unit } = arena(version);
    const healer = unit('healer'),
      siege = unit('wallwrecker', 5.5),
      giant = unit('giant', 6);
    siege.hp = giant.hp = 100;
    healer.healTarget = siege.id;
    prepareHealerTargets(battle);
    expect(healer.healTarget).toBe(version >= 96 ? giant.id : siege.id);
  }
});

it('does not let immune housing make a tiny ground troop eligible for Healer clustering', () => {
  const { battle, unit } = arena();
  const healer = unit('healer'),
    siege = unit('wallwrecker'),
    small = unit('swordsman');
  unit('swordsman');
  siege.hp = 100;
  small.hp = 10;
  healer.healTarget = siege.id;
  prepareHealerTargets(battle);
  expect(healer.healTarget).toBeUndefined();
  stepHealer(battle, healer, { ...nativeUnitStats('healer', 1) }, 0.05, () => {});
  expect(battle.projectiles ?? []).toEqual([]);
});

it('heals eligible neighbors at projectile impact while leaving immune siege HP unchanged', () => {
  for (const version of [95, 96]) {
    const { battle, unit } = arena(version);
    const healer = unit('healer'),
      siege = unit('wallwrecker'),
      giant = unit('giant');
    siege.hp = giant.hp = 100;
    healer.healTarget = giant.id;
    const shot = launchProjectile(
      battle,
      {
        weapon: 'healing',
        sourceId: healer.id,
        targetId: giant.id,
        targetBuilding: false,
        fromX: 5,
        fromY: 5,
        x: 5,
        y: 5,
        damage: 100,
        splash: 1.5,
      },
      () => {},
    );
    battle.elapsed = shot.impact;
    stepProjectiles(
      battle,
      () => {},
      () => {},
    );
    expect(giant.hp).toBe(200);
    expect(siege.hp).toBe(version >= 96 ? 100 : 200);
  }
});

for (const state of ['waiting-bird', 'egg', 'recalled', 'future', 'ejected'] as const) {
  it(`does not select a ${state} as a native healing target or chain recipient`, () => {
    const { battle, unit, ctx } = arena();
    const druid = unit('druid'),
      invalid = unit(state === 'waiting-bird' ? 'phoenix' : 'giant', 5.1),
      giant = unit('giant', 6);
    invalid.hp = giant.hp = 100;
    if (state === 'waiting-bird') invalid.native!.phoenixWaiting = true;
    if (state === 'egg') invalid.native!.untargetable = true;
    if (state === 'recalled') invalid.native!.recalled = true;
    if (state === 'future') invalid.spawnedAt = 1;
    if (state === 'ejected') invalid.ejected = true;
    druid.healTarget = invalid.id;
    const stats = nativeUnitStats('druid', 1);
    stepNativeUnit(ctx, druid, stats, 0.05);
    expect(druid.healTarget).toBe(giant.id);
    expect(giant.hp).toBe(100 + stats.heal);
    expect(invalid.hp).toBe(100);
  });
}

it('retargets native healing away from an immune unit without wasting a chain hop', () => {
  const { battle, unit, ctx } = arena();
  const druid = unit('druid'),
    siege = unit('wallwrecker', 5.1),
    a = unit('giant', 6),
    b = unit('giant', 7);
  siege.hp = a.hp = b.hp = 100;
  druid.healTarget = siege.id;
  const stats = nativeUnitStats('druid', 1);
  stepNativeUnit(ctx, druid, stats, 0.05);
  expect(druid.healTarget).toBe(a.id);
  expect([a.hp, b.hp]).toEqual([100 + stats.heal, 100 + stats.heal]);
  expect(siege.hp).toBe(100);
});

it('continues to heal invisible and burrowed friendly units', () => {
  const { battle, unit } = arena();
  const giant = unit('giant'),
    miner = unit('miner');
  giant.native!.effects = { invisibleUntil: 10 };
  giant.hp = miner.hp = 100;
  expect(miner.native!.burrowed).toBe(true);
  expect(healUnit(battle, giant, 20)).toBe(20);
  expect(healUnit(battle, miner, 20)).toBe(20);
});

it('ignores the waiting bird for Baby Dragon Tantrum, then counts the hatched flyer', () => {
  for (const version of [95, 96]) {
    const { battle, unit, ctx } = arena(version);
    const baby = unit('babydragon'),
      bird = unit('phoenix');
    bird.native!.phoenixWaiting = bird.native!.untargetable = true;
    stepNativeUnit(ctx, baby, nativeUnitStats('babydragon', 1), 0.05);
    expect(baby.native!.alone).toBe(version >= 96);
    delete bird.native!.phoenixWaiting;
    delete bird.native!.untargetable;
    battle.elapsed += 0.05;
    stepNativeUnit(ctx, baby, nativeUnitStats('babydragon', 1), 0.05);
    expect(baby.native!.alone).toBe(false);
  }
});

it("ignores another Hero's waiting Phoenix for Royal Rampage", () => {
  for (const version of [95, 96]) {
    const { battle, unit, ctx } = arena(version);
    const duke = unit('dragonduke'),
      bird = unit('phoenix');
    duke.hero = 'duke';
    const hero = { kind: 'duke' as const, level: 1, items: [], unitId: duke.id };
    battle.nativeHeroes = [hero];
    bird.native!.phoenixWaiting = bird.native!.untargetable = true;
    refreshHeroPassives(ctx, hero, duke);
    expect(unitDamageScale(duke, battle.elapsed)).toBe(version >= 96 ? 2 : 1);
    delete bird.native!.phoenixWaiting;
    delete bird.native!.untargetable;
    refreshHeroPassives(ctx, hero, duke);
    expect(unitDamageScale(duke, battle.elapsed)).toBe(1);
  }
});

it.each(['waiting-bird', 'egg', 'recalled', 'future'] as const)(
  'does not follow a %s housing cluster',
  (state) => {
    for (const version of [95, 96]) {
      const { unit, ctx } = arena(version);
      const warden = unit('grandwarden', 10, 10);
      unit('giant', 2, 10);
      const ghost = unit(state === 'egg' ? 'phoenixegg' : 'phoenix', 18, 10);
      if (state === 'waiting-bird') ghost.native!.phoenixWaiting = true;
      if (state === 'egg') ghost.native!.untargetable = true;
      if (state === 'recalled') ghost.native!.recalled = true;
      if (state === 'future') ghost.spawnedAt = 1;
      stepNativeUnit(ctx, warden, nativeUnitStats('grandwarden', 1), 0.05);
      if (version >= 96) expect(warden.x).toBeLessThan(10);
      else expect(warden.x).toBeGreaterThan(10);
    }
  },
);

it.each(['healing', 'rage'] as const)(
  'reproduces real %s inputs through portable files and backward seeks',
  (mode) => {
    const recording = nativeFriendlyRecording(mode);
    const viewer = new GameModel();
    expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(recording.data))))).toBe(
      true,
    );
    for (const snapshot of [...recording.snapshots].reverse()) {
      viewer.seekReplay(snapshot.at);
      while (viewer.replay!.seeking) viewer.step(0.05);
      expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
    }
  },
);
