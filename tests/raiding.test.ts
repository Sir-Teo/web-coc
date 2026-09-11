import { developedSave } from './fixtures/developed-village';
import { describe, it, expect } from 'vitest';
import {
  GameModel,
  makeBuilding,
  initialSave,
  breachTarget,
  type Building,
  type Unit,
  type Save,
} from '../src/game/model';
import { TROOPS, TROOP_KEYS, CAMPAIGN, type TroopKind } from '../src/game/data';
import { migrateSave, validateSave } from '../src/game/save';

function arena(buildings: Building[], configure?: (model: GameModel) => void) {
  const model = new GameModel();
  configure?.(model);
  model.startBattle(0);
  model.battle!.buildings = buildings;
  model.battle!.started = true;
  return model;
}
function unit(model: GameModel, kind: TroopKind, x: number, y: number) {
  const d = model.troopStats(kind);
  const u: Unit = {
    id: model.state.nextId++,
    kind,
    x,
    y,
    hp: d.hp,
    maxHp: d.hp,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
  model.battle!.units.push(u);
  return u;
}
function advance(model: GameModel, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) model.step(0.05);
}

describe('specialist troops', () => {
  it('Goblins pass a closer barracks to attack resources, at double damage', () => {
    const barracks = makeBuilding(1000, 'barracks', 7, 8);
    const mine = makeBuilding(1001, 'goldmine', 12, 8);
    const m = arena([barracks, mine]);
    const goblin = unit(m, 'goblin', 6, 9);
    m.step(0.05);
    expect(goblin.target).toBe(mine.id);
    goblin.x = 11.5;
    goblin.y = 9;
    m.step(0.05);
    expect(mine.maxHp - mine.hp).toBe(TROOPS.goblin.damage * 2);
    expect(barracks.hp).toBe(barracks.maxHp);
    // Once the resources are gone, it falls back to ordinary buildings.
    m.damage(mine, mine.hp);
    m.step(0.05);
    expect(goblin.target).toBe(barracks.id);
    goblin.x = 6.5;
    goblin.y = 9;
    goblin.cooldown = 0;
    m.step(0.05);
    expect(barracks.maxHp - barracks.hp).toBe(TROOPS.goblin.damage);
  });
  it('Wall Breakers find a protecting wall and open a multi-tile breach exactly once', () => {
    const walls: Building[] = [];
    let id = 1100;
    for (let n = 8; n <= 16; n++) {
      walls.push(makeBuilding(id++, 'wall', 8, n), makeBuilding(id++, 'wall', 16, n));
      if (n > 8 && n < 16)
        walls.push(makeBuilding(id++, 'wall', n, 8), makeBuilding(id++, 'wall', n, 16));
    }
    const hall = makeBuilding(1000, 'townhall', 11, 11);
    const stray = makeBuilding(1001, 'wall', 3, 11);
    const m = arena([hall, stray, ...walls]);
    const breaker = unit(m, 'wallbreaker', 4.5, 12.5);
    expect(breachTarget(breaker, m.battle!.buildings)?.x).toBe(8);
    advance(m, 8);
    expect(breaker.hp).toBe(0);
    expect(breaker.spent).toBe(true);
    expect(walls.filter((w) => w.hp === 0).length).toBeGreaterThanOrEqual(2);
    expect(stray.hp).toBe(stray.maxHp);
    const hp = m.battle!.buildings.map((b) => b.hp);
    advance(m, 2);
    expect(m.battle!.buildings.map((b) => b.hp)).toEqual(hp);
  });
  it('a defeated Wall Breaker leaves a weaker bomb, with researched damage', () => {
    const wall = makeBuilding(1000, 'wall', 10, 10, 4);
    const hall = makeBuilding(1001, 'townhall', 20, 20);
    const m = arena([wall, hall], (model) => {
      model.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 2])) as Record<
        TroopKind,
        number
      >;
    });
    const breaker = unit(m, 'wallbreaker', 9.5, 10.5);
    breaker.hp = 0;
    m.step(0.05);
    expect(wall.maxHp - wall.hp).toBeCloseTo(TROOPS.wallbreaker.deathDamage! * 1.3 * 40);
    const hp = wall.hp;
    advance(m, 1);
    expect(wall.hp).toBe(hp);
  });
  it('a Wall Breaker without walls sacrifices itself against a normal building', () => {
    const hall = makeBuilding(1000, 'townhall', 10, 10);
    const m = arena([hall]);
    const breaker = unit(m, 'wallbreaker', 9.5, 11);
    m.step(0.05);
    expect(breaker.hp).toBe(0);
    expect(hall.maxHp - hall.hp).toBe(TROOPS.wallbreaker.damage);
  });
  it('trains, researches, deploys and replenishes the new troops', () => {
    const m = new GameModel(developedSave());
    for (const kind of TROOP_KEYS) m.state.army[kind] = 0;
    m.train('goblin', 2);
    m.train('wallbreaker');
    m.tick(m.clock + 60000);
    expect(m.state.army.goblin).toBe(2);
    expect(m.state.army.wallbreaker).toBe(1);
    m.state.buildings.find((b) => b.kind === 'laboratory')!.level = 2;
    m.researchTroop('wallbreaker');
    m.tick(m.state.research!.end + 1);
    expect(m.troopLevel('wallbreaker')).toBe(2);
    m.startBattle(0);
    m.activeTroop = 'wallbreaker';
    m.deploy(1, 1);
    m.finishBattle();
    m.returnHome();
    m.retrain();
    expect(m.state.queue).toEqual([]);
    expect(m.state.army.wallbreaker).toBe(1);
    expect(validateSave(m.state)).toBe(true);
  });
});

describe('mortar fire and defense targeting', () => {
  it('cannot shoot inside its blind spot or at air troops', () => {
    const mortar = makeBuilding(1000, 'mortar', 10, 10);
    const m = arena([mortar, makeBuilding(1001, 'townhall', 22, 22)]);
    const close = unit(m, 'giant', 12, 11);
    const air = unit(m, 'balloon', 17, 11);
    m.step(0.05);
    expect(m.battle!.shells).toHaveLength(0);
    expect(close.hp).toBe(close.maxHp);
    expect(air.hp).toBe(air.maxHp);
  });
  it('shells land after travel time, hit a ground cluster and can be dodged', () => {
    const m = arena([makeBuilding(1000, 'mortar', 10, 10), makeBuilding(1001, 'townhall', 22, 22)]);
    const decoy = unit(m, 'goblin', 17, 11);
    m.step(0.05);
    expect(decoy.hp).toBe(decoy.maxHp);
    expect(m.battle!.shells).toHaveLength(1);
    const shell = m.battle!.shells[0];
    decoy.x = 25;
    decoy.y = 3;
    const one = unit(m, 'giant', shell.x, shell.y);
    const two = unit(m, 'giant', shell.x + 0.1, shell.y);
    const air = unit(m, 'balloon', shell.x, shell.y);
    advance(m, 1.3);
    expect(m.battle!.shells).toHaveLength(0);
    expect(decoy.hp).toBe(decoy.maxHp);
    expect(one.hp).toBe(one.maxHp - shell.damage);
    expect(two.hp).toBe(two.maxHp - shell.damage);
    expect(air.hp).toBe(air.maxHp);
  });
  it('an airborne shell still lands after its mortar is destroyed', () => {
    const mortar = makeBuilding(1000, 'mortar', 10, 10);
    const m = arena([mortar, makeBuilding(1001, 'townhall', 22, 22)]);
    const giant = unit(m, 'giant', 17, 11);
    m.step(0.05);
    const shell = m.battle!.shells[0];
    m.damage(mortar, mortar.hp);
    advance(m, 1.3);
    expect(giant.hp).toBe(giant.maxHp - shell.damage);
  });
  it('a cannon keeps its tank target when a fragile troop moves closer, then retargets', () => {
    const cannon = makeBuilding(1000, 'cannon', 10, 10);
    const m = arena([cannon, makeBuilding(1001, 'townhall', 22, 22)]);
    const giant = unit(m, 'giant', 15, 11);
    m.step(0.05);
    const archer = unit(m, 'archer', 12.5, 11);
    cannon.cooldown = 0;
    m.step(0.05);
    expect(archer.hp).toBe(archer.maxHp);
    expect(m.battle!.defenseTargets[cannon.id]).toBe(giant.id);
    giant.hp = 0;
    cannon.cooldown = 0;
    m.step(0.05);
    expect(m.battle!.defenseTargets[cannon.id]).toBe(archer.id);
    expect(archer.hp).toBe(archer.maxHp);
    advance(m, 0.4);
    expect(archer.hp).toBeLessThan(archer.maxHp);
  });
});

describe('resource raids and save compatibility', () => {
  it('pays gold as storage is damaged, without requiring destruction or a star', () => {
    const storage = makeBuilding(1000, 'goldstorage', 10, 10);
    const collector = makeBuilding(1001, 'collector', 20, 20);
    const m = arena([storage, collector]);
    m.damage(storage, storage.maxHp / 2);
    m.finishBattle();
    expect(m.battle!.result!.gold).toBe(CAMPAIGN[0].gold / 2);
    expect(m.battle!.result!.elixir).toBe(0);
    expect(m.battle!.result!.destruction).toBe(0);
    expect(m.battle!.result!.stars).toBe(0);
    const gold = m.state.gold;
    m.finishBattle();
    expect(m.state.gold).toBe(gold);
  });
  it('pays exactly the advertised loot on a full clear', () => {
    const m = new GameModel();
    m.startBattle(0);
    for (const b of m.battle!.buildings) m.damage(b, b.hp);
    m.finishBattle();
    expect(m.battle!.loot).toEqual({ gold: CAMPAIGN[0].gold, elixir: CAMPAIGN[0].elixir });
    expect(m.battle!.stars).toBe(3);
  });
  it('opens an older version-2 save without granting troops or changing progress', () => {
    const old = structuredClone(initialSave());
    (old as unknown as { version: number }).version = 2;
    old.gold = 4321;
    old.lastArmy = { ...old.army };
    old.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, 3])) as Record<
      TroopKind,
      number
    >;
    for (const kind of ['goblin', 'wallbreaker'] as const) {
      delete (old.army as Partial<Save['army']>)[kind];
      delete (old.lastArmy as Partial<Save['army']>)[kind];
      delete (old.troopLevels as Partial<Save['army']>)[kind];
    }
    expect(validateSave(old)).toBe(false);
    const migrated = migrateSave(old) as Save;
    expect(validateSave(migrated)).toBe(true);
    expect(migrated.army.goblin).toBe(0);
    expect(migrated.army.wallbreaker).toBe(0);
    expect(migrated.troopLevels!.goblin).toBe(1);
    expect(migrated.troopLevels!.archer).toBe(3);
    expect(migrated.gold).toBe(4321);
    expect(migrateSave(migrated)).toEqual(migrated);
  });
  it('does not repair invalid new troop fields to bypass save validation', () => {
    const invalid = initialSave();
    invalid.army.goblin = NaN;
    expect(validateSave(migrateSave(invalid))).toBe(false);
  });
});

describe('putting the village away mid-raid', () => {
  it('settles an attack in progress instead of spending the army for nothing', () => {
    const m = new GameModel();
    const army = { ...m.state.army };
    const trophies = m.state.trophies;
    m.startBattle(0);
    m.activeTroop = 'swordsman';
    for (let i = 0; i < 6; i++) expect(m.deploy(1 + i * 0.3, 1)).toBe(true);
    for (let t = 0; t < 400; t++) m.step(0.05);
    m.suspendBattle();
    expect(m.battle).toBeNull();
    expect(m.state.raidLog).toHaveLength(1);
    expect(m.state.stats.raids).toBe(1);
    expect(m.state.army.swordsman).toBe(army.swordsman - 6);
    expect(m.state.trophies).not.toBe(trophies);
    // The settled result survives the reload the suspension was preparing for.
    const reloaded = new GameModel(structuredClone(m.state));
    expect(validateSave(reloaded.state)).toBe(true);
    expect(reloaded.state.raidLog).toHaveLength(1);
  });
  it('charges nothing when the attack was still being scouted', () => {
    const m = new GameModel();
    const army = { ...m.state.army };
    const trophies = m.state.trophies;
    m.startBattle(0);
    for (let t = 0; t < 100; t++) m.step(0.05);
    m.suspendBattle();
    expect(m.battle).toBeNull();
    expect(m.state.raidLog ?? []).toHaveLength(0);
    expect(m.state.army).toEqual(army);
    expect(m.state.trophies).toBe(trophies);
  });
  it('leaves a replay alone rather than recording it as an attack', () => {
    const m = new GameModel();
    m.startBattle(0);
    m.activeTroop = 'swordsman';
    for (let i = 0; i < 8; i++) m.deploy(1 + i * 0.2, 10);
    for (let t = 0; t < 2600 && !m.battle!.finished; t++) m.step(0.05);
    const viewer = new GameModel(structuredClone(m.state));
    expect(viewer.startReplay(viewer.state.raidLog![0].id)).toBe(true);
    viewer.suspendBattle();
    expect(viewer.replay).toBeNull();
    expect(viewer.battle).toBeNull();
    expect(viewer.state.raidLog).toHaveLength(1);
    expect(viewer.state.stats.raids).toBe(m.state.stats.raids);
  });
});

describe('loot the storages can actually take', () => {
  const raid = (prepare: (model: GameModel) => void) => {
    const m = new GameModel();
    prepare(m);
    m.startBattle(0);
    m.activeTroop = 'swordsman';
    for (let i = 0; i < 12; i++) m.deploy(1 + i * 0.2, 10);
    for (let t = 0; t < 2600 && !m.battle!.finished; t++) m.step(0.05);
    return m;
  };
  it('shows nothing on the loot bars when there is nowhere to put it', () => {
    const m = raid((v) => {
      v.state.gold = v.resourceCap('gold');
      v.state.elixir = v.resourceCap('elixir');
    });
    expect(m.battle!.destruction).toBeGreaterThan(0);
    expect(m.battle!.loot).toEqual({ gold: 0, elixir: 0 });
    expect(m.battle!.result!.gold).toBe(0);
    expect(m.battle!.result!.elixir).toBe(0);
  });
  it('stops the bars at the remaining headroom and banks exactly that', () => {
    const m = raid((v) => {
      v.state.gold = v.resourceCap('gold') - 500;
      v.state.elixir = v.resourceCap('elixir') - 700;
    });
    expect(m.battle!.loot.gold).toBe(500);
    expect(m.battle!.loot.elixir).toBe(700);
    expect(m.battle!.result!.gold).toBe(m.battle!.loot.gold);
    expect(m.battle!.result!.elixir).toBe(m.battle!.loot.elixir);
    expect(m.state.gold).toBe(m.resourceCap('gold'));
    expect(m.state.elixir).toBe(m.resourceCap('elixir'));
  });
  it('still pays a full raid into an empty village', () => {
    const m = raid((v) => {
      v.state.gold = 0;
      v.state.elixir = 0;
    });
    expect(m.battle!.loot.gold).toBeGreaterThan(0);
    expect(m.battle!.result!.gold).toBe(m.battle!.loot.gold);
    expect(m.state.gold).toBe(m.battle!.loot.gold);
  });
});
