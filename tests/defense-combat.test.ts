import { describe, expect, it } from 'vitest';
import { BUILDINGS, defenseDamage, defenseDps, type TroopKind } from '../src/game/data';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { REPLAY_VERSION, validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

function arena(kind: 'cannon' | 'archertower', level = 1, troop: TroopKind = 'giant') {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  const tower = makeBuilding(9000, kind, 10, 10, level);
  b.buildings = [tower];
  b.started = true;
  const u: Unit = {
    id: 9001,
    kind: troop,
    x: 11,
    y: 11,
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
  cannon: [9, 11, 15, 19, 25, 31, 40, 48, 56, 64, 74, 85],
  archertower: [11, 15, 19, 25, 30, 35, 42, 48, 56, 63, 70, 74],
};
const hits = {
  cannon: [7.2, 8.8, 12, 15.2, 20, 24.8, 32, 38.4, 44.8, 51.2, 59.2, 68],
  archertower: [5.5, 7.5, 9.5, 12.5, 15, 17.5, 21, 24, 28, 31.5, 35, 37],
};

describe('normal-mode Cannon and Archer Tower combat', () => {
  for (const kind of ['cannon', 'archertower'] as const) {
    it(`${kind} uses audited damage at every supported and legacy level, applied at impact`, () => {
      for (let level = 1; level <= 12; level++) {
        expect(defenseDps(kind, level)).toBe(dps[kind][level - 1]);
        expect(defenseDamage(kind, level)).toBe(hits[kind][level - 1]);
        const { m, b, tower, u } = arena(kind, level);
        m.step(0.01);
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
      const range = kind === 'cannon' ? 9 : 10;
      expect(BUILDINGS[kind].range).toBe(range);
      const { m, b, tower, u } = arena(kind);
      // The immobilized target remains at the exact range boundary.
      u.x = 11 + range + 0.001;
      m.step(0.01);
      expect(b.projectiles).toHaveLength(0);
      u.x = 11 + range;
      m.step(0.01);
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
        const rate = kind === 'cannon' ? 0.8 : 0.5;
        expect(BUILDINGS[kind].rate).toBe(rate);
        for (let i = 0; i < 16 * fps; i++) m.step(1 / fps);
        expect(launches).toHaveLength(16 / rate);
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
      expect(b.projectiles).toHaveLength(1);
      expect(tower.cooldown).toBe(BUILDINGS[kind].rate);
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
    r.replay!.version = 4;
    const before = structuredClone(r.result);
    expect(validateReplay(r.replay)).toBe(true);
    expect(validateSave(m.state)).toBe(true);
    m.returnHome();
    expect(m.startReplay(r.id)).toBe(false);
    expect(r.result).toEqual(before);
    expect(m.battle).toBeNull();
  });
});
