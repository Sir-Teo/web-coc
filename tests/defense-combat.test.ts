import { describe, expect, it } from 'vitest';
import { BUILDINGS, defenseDamage, defenseDps, type TroopKind } from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

type Defense = 'cannon' | 'archertower' | 'airdefense' | 'wizardtower';
function arena(
  kind: Defense,
  level = 1,
  troop: TroopKind = kind === 'airdefense' ? 'balloon' : 'giant',
) {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const tower = makeBuilding(9000, kind, 10, 10, level);
  b.buildings = [tower];
  b.started = true;
  const u: Unit = {
    id: 9001,
    kind: troop,
    x: 10 + BUILDINGS[kind].size / 2,
    y: 10 + BUILDINGS[kind].size / 2,
    hp: 100000,
    maxHp: 100000,
    springUntil: 100000, // Immobilize the target to isolate tower range and cadence.
    cooldown: 100000,
    target: tower.id,
    path: [],
    pathAt: 100000,
    attacking: false,
  };
  b.units = [u];
  return { m, b, tower, u };
}

const dps = {
  airdefense: [80, 110, 140, 160, 190, 230, 280, 320, 360, 400],
  wizardtower: [11, 13, 16, 20, 24, 32, 40, 45],
  cannon: [7, 10, 13, 17, 23, 30, 40, 48, 56, 64, 74, 85],
  archertower: [11, 15, 19, 25, 30, 35, 42, 48, 56, 63, 70, 74],
};
const hits = {
  airdefense: [80, 110, 140, 160, 190, 230, 280, 320, 360, 400],
  wizardtower: [14.3, 16.9, 20.8, 26, 31.2, 41.6, 52, 58.5],
  cannon: [5.6, 8, 10.4, 13.6, 18.4, 24, 32, 38.4, 44.8, 51.2, 59.2, 68],
  archertower: [5.5, 7.5, 9.5, 12.5, 15, 17.5, 21, 24, 28, 31.5, 35, 37],
};

const ranges = { cannon: 9, archertower: 10, airdefense: 10, wizardtower: 7 };
const rates = { cannon: 0.8, archertower: 0.5, airdefense: 1, wizardtower: 1.3 };

describe('audited direct-projectile defense combat', () => {
  for (const kind of ['cannon', 'archertower', 'airdefense', 'wizardtower'] as const) {
    it(`${kind} uses audited damage at every supported and legacy level, applied at impact`, () => {
      for (let level = 1; level <= dps[kind].length; level++) {
        expect(defenseDps(kind, level)).toBe(dps[kind][level - 1]);
        expect(defenseDamage(kind, level)).toBe(hits[kind][level - 1]);
        const { m, b, tower, u } = arena(kind, level);
        m.step(0.01);
        if (kind === 'archertower') m.step(5 / 24);
        const shot = b.projectiles![0];
        expect(shot.sourceId).toBe(tower.id);
        expect(shot.damage).toBe(hits[kind][level - 1]);
        expect(u.hp).toBe(u.maxHp);
        tower.cooldown = 1000;
        m.step(shot.impact - b.elapsed - 0.001);
        expect(u.hp).toBe(u.maxHp);
        m.step(0.001);
        expect(u.hp).toBeCloseTo(u.maxHp - hits[kind][level - 1]);
      }
      expect(BUILDINGS[kind].damage).toBe(hits[kind][0]);
    });

    it(`${kind} reaches the range boundary but never beyond it`, () => {
      const range = ranges[kind];
      expect(BUILDINGS[kind].range).toBe(range);
      const { m, b, tower, u } = arena(kind);
      // The immobilized target remains at the exact range boundary.
      const center = 10 + BUILDINGS[kind].size / 2;
      u.x = center + range + 0.001;
      m.step(0.01);
      expect(b.projectiles).toHaveLength(0);
      u.x = center + range;
      m.step(0.01);
      if (kind === 'archertower') m.step(5 / 24);
      expect(b.projectiles![0].targetId).toBe(u.id);
      expect(b.defenseTargets[tower.id]).toBe(u.id);
    });

    for (const fps of [20, 30, 60]) {
      it(`${kind} sustains its firing interval at ${fps} frames per second without accumulating drift`, () => {
        const { m, b, tower } = arena(kind);
        const launches: number[] = [];
        m.onEffect = (fx) => {
          if (fx.type === 'projectile' && fx.sourceId === tower.id) launches.push(b.elapsed);
        };
        const rate = rates[kind];
        expect(BUILDINGS[kind].rate).toBe(rate);
        for (let i = 0; i < 16 * fps; i++) m.step(1 / fps);
        expect(launches).toHaveLength(Math.ceil(16 / rate));
        launches.forEach((at, i) =>
          expect(Math.abs(at - launches[0] - i * rate)).toBeLessThanOrEqual(1 / fps + 1e-8),
        );
      });
    }

    it(`${kind} resumes after idle time without rapid catch-up shots`, () => {
      const { m, b, tower, u } = arena(kind);
      u.x = 27;
      for (let i = 0; i < 100; i++) m.step(0.05);
      expect(b.projectiles).toHaveLength(0);
      u.x = 11;
      m.step(0.01);
      if (kind === 'archertower') m.step(5 / 24);
      expect(b.projectiles).toHaveLength(1);
      expect(tower.cooldown).toBeCloseTo(BUILDINGS[kind].rate);
      m.step(0.01);
      expect(b.projectiles).toHaveLength(1);
    });

    it(`${kind} cannot fire while under construction or upgrading`, () => {
      for (const flag of ['constructing', 'upgradeEnd'] as const) {
        const { m, b, tower } = arena(kind);
        if (flag === 'constructing') tower.constructing = true;
        else tower.upgradeEnd = m.clock + 100000;
        m.step(0.1);
        expect(b.projectiles).toHaveLength(0);
        delete tower[flag];
        m.step(0.01);
        if (kind === 'archertower') m.step(5 / 24);
        expect(b.projectiles).toHaveLength(1);
      }
    });
  }

  it('retains a living target until it leaves range, then acquires another', () => {
    const { m, b, tower, u } = arena('cannon');
    u.x = 18;
    m.step(0.01);
    const closer = { ...u, id: 9002, x: 12, path: [] };
    b.units.push(closer);
    m.step(0.8);
    expect(b.projectiles!.at(-1)!.targetId).toBe(u.id);
    u.x = 21;
    m.step(0.8);
    expect(b.projectiles!.at(-1)!.targetId).toBe(closer.id);
    expect(b.defenseTargets[tower.id]).toBe(closer.id);
  });

  it('Cannons ignore flying troops while Archer Towers hit either layer', () => {
    const cannon = arena('cannon', 1, 'balloon');
    cannon.m.step(0.05);
    expect(cannon.b.projectiles).toHaveLength(0);
    const archer = arena('archertower', 1, 'balloon');
    archer.m.step(0.05);
    archer.m.step(5 / 24);
    expect(archer.b.projectiles![0]).toMatchObject({
      targetId: archer.u.id,
      toAir: true,
      damage: 5.5,
    });
  });

  it('retains pre-update results while refusing playback under different combat rules', () => {
    const m = new GameModel();
    m.startBattle(0, true);
    m.deploy(1, 13);
    m.step(0.05);
    m.finishBattle();
    const r = m.state.raidLog![0];
    expect(r.replay!.version).toBe(REPLAY_VERSION);
    r.replay!.version = 7;
    const before = structuredClone(r.result);
    expect(validateReplay(r.replay)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    m.returnHome();
    expect(m.startReplay(r.id)).toBe(false);
    expect(r.result).toEqual(before);
    expect(m.battle).toBeNull();
  });

  it('Air Defense ignores ground troops and a launched rocket damages only its airborne target after the launcher dies', () => {
    const ground = arena('airdefense', 1, 'giant');
    ground.m.step(0.05);
    expect(ground.b.projectiles).toHaveLength(0);
    const { m, b, tower, u } = arena('airdefense');
    b.buildings.push(makeBuilding(9010, 'townhall', 22, 22));
    const neighbor = { ...u, id: 9002, x: u.x + 0.1, path: [] };
    b.units.push(neighbor);
    m.step(0.05);
    const shot = b.projectiles![0];
    expect(shot).toMatchObject({ weapon: 'rocket', damage: 80, targetId: u.id, toAir: true });
    tower.hp = 0;
    m.step(shot.impact - b.elapsed);
    expect(u.hp).toBe(u.maxHp - 80);
    expect(neighbor.hp).toBe(neighbor.maxHp);
  });

  it.each(['giant', 'balloon'] as const)(
    'Wizard Tower splash reaches exactly one tile on the %s layer',
    (troop) => {
      const { m, b, tower, u } = arena('wizardtower', 1, troop);
      const boundary = { ...u, id: 9002, x: u.x + 1, path: [] };
      const outside = { ...u, id: 9003, x: u.x + 1.001, path: [] };
      const other = {
        ...u,
        id: 9004,
        kind: troop === 'balloon' ? ('giant' as const) : ('balloon' as const),
        path: [],
      };
      b.units.push(boundary, outside, other);
      m.step(0.05);
      const shot = b.projectiles![0];
      expect(shot.splash).toBe(1);
      tower.cooldown = 1000;
      m.step(shot.impact - b.elapsed);
      expect(u.hp).toBeCloseTo(u.maxHp - 14.3);
      expect(boundary.hp).toBeCloseTo(boundary.maxHp - 14.3);
      expect(outside.hp).toBe(outside.maxHp);
      expect(other.hp).toBe(other.maxHp);
    },
  );
});
