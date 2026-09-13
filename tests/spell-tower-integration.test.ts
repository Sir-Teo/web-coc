import { describe, expect, it } from 'vitest';
import { defenseDamage, type BuildingKind } from '../src/game/data';
import { GameModel, type Battle, type Building } from '../src/game/model';
import { replayBattle } from '../src/game/replay';
import type { SpellTowerCast } from '../src/game/spell-tower';
import { stepInfernos } from '../src/game/inferno-battle';
import { attacker, lateBuilding, lateSetup } from './fixtures/late-defense-battle';

/** A version-44 late campaign model: the distant Spell Tower only creates late state. */
function lateModel(buildings: Building[], version = 44) {
  const model = new GameModel();
  const setup = lateSetup(86, {}, [...buildings, lateBuilding(900, 'spelltower', 44, 44, 3, 'rage')]);
  model.battle = replayBattle(setup, version);
  model.battle.started = true;
  return model;
}
function covering(battle: Battle, weapon: SpellTowerCast['weapon'], x: number, y: number, deployAt = -0.5) {
  const cast: SpellTowerCast = {
    index: 1,
    sourceId: 900,
    weapon,
    level: 3,
    at: deployAt - 0.8,
    deployAt,
    fromX: x,
    fromY: y,
    x,
    y,
    targetId: null,
    onDeath: false,
    applied: weapon === 'rage' ? 60 : weapon === 'poison' ? 30 : 18,
  };
  battle.late!.spellTower = {
    towers: {},
    casts: [cast],
    poisonTick: 1,
    defenderRage: {},
    defenderHidden: {},
  };
}

describe('defensive Rage threading', () => {
  for (const [kind, level] of [
    ['cannon', 10],
    ['xbow', 5],
    ['archertower', 12],
    ['mortar', 8],
    ['wizardtower', 10],
  ] as [BuildingKind, number][])
    it(`scales ${kind} primary damage only while enraged`, () => {
      const damages = [false, true].map((raged) => {
        const model = lateModel([lateBuilding(1, kind, 20, 20, level)]);
        const b = model.battle!;
        if (raged) covering(b, 'rage', 21.5, 21.5);
        b.units.push(attacker(7, 'giant', 21.5, 21.5 + 5.2, 1e9, 900, { cooldown: 99, pathAt: 99 }));
        for (let i = 0; i < 80 && !b.projectiles?.length && !b.shells.length; i++) model.step(0.05);
        return (b.projectiles?.[0]?.damage ?? b.shells[0]?.damage)!;
      });
      expect(damages[0]).toBeCloseTo(
        defenseDamage(kind, level),
        kind === 'xbow' ? 9 : 12,
      );
      expect(damages[1]).toBeCloseTo(damages[0] * 1.6, 9);
    });

  it('scales Inferno pulses at their source tick', () => {
    const hits = [false, true].map((raged) => {
      const model = lateModel([lateBuilding(1, 'inferno', 20, 20, 8)]);
      const b = model.battle!;
      if (raged) covering(b, 'rage', 21, 21);
      b.units.push(attacker(7, 'giant', 21, 25, 1e9, 900));
      for (let i = 0; i < 20; i++) {
        b.elapsed += 0.05;
        stepInfernos(b, 0.05);
      }
      return b.infernos![1].hits.map((h) => h.damage);
    });
    expect(hits[0].length).toBeGreaterThan(0);
    expect(hits[1]).toEqual(hits[0].map((d) => expect.closeTo(d * 1.6, 9)));
  });

  it('enrages skeleton defenders in the area', () => {
    const results = [false, true].map((raged) => {
      const model = lateModel([lateBuilding(1, 'cannon', 10, 10, 1)]);
      const b = model.battle!;
      // Pulses from before the first step keep the area enraged for every skeleton swing.
      covering(b, 'rage', 30, 30, -1);
      b.late!.spellTower!.casts[0].applied = 0;
      const target = attacker(7, 'giant', 30.2, 30, 1e9, 900, { cooldown: 99, pathAt: 99 });
      b.units.push(target);
      b.defenders = [
        {
          id: -1,
          kind: 'skeleton',
          sourceId: 1,
          mode: 'ground',
          x: 30,
          y: 30,
          hp: 1e6,
          maxHp: 1e6,
          spawnedAt: -10,
          cooldown: 0,
          target: null,
          path: [],
          pathAt: 0,
          attacking: false,
        },
      ];
      if (!raged) b.late!.spellTower!.casts = [];
      for (let i = 0; i < 20; i++) model.step(0.05);
      return 1e9 - target.hp;
    });
    expect(results[0]).toBeGreaterThan(0);
    expect(results[1]).toBeCloseTo(results[0] * 1.6, 6);
  });
});

describe('Poison and Invisibility in the live model', () => {
  it('slows poisoned movement by 35% and attack timers by 25%', () => {
    const travel = [false, true].map((poisoned) => {
      const model = lateModel([lateBuilding(1, 'goldstorage', 30, 30, 10)]);
      const b = model.battle!;
      const giant = attacker(7, 'giant', 10, 31, 1e9, 900);
      b.units.push(giant);
      if (poisoned) giant.late = { spellTower: { poisonDps: 0, poisonTime: 0, poisonHold: 0, slowUntil: 99 } };
      model.step(0.05);
      const start = giant.x;
      for (let i = 0; i < 10; i++) model.step(0.05);
      return giant.x - start;
    });
    expect(travel[0]).toBeGreaterThan(0);
    expect(travel[1]).toBeCloseTo(travel[0] * 0.65, 9);
    const cooldowns = [false, true].map((poisoned) => {
      const model = lateModel([lateBuilding(1, 'goldstorage', 30, 30, 10)]);
      const b = model.battle!;
      const giant = attacker(7, 'giant', 29.5, 31, 1e9, 900);
      b.units.push(giant);
      model.step(0.05);
      giant.cooldown = 5;
      if (poisoned) giant.late = { spellTower: { poisonDps: 0, poisonTime: 0, poisonHold: 0, slowUntil: 99 } };
      model.step(0.05);
      return 5 - giant.cooldown;
    });
    expect(cooldowns[1]).toBeCloseTo(cooldowns[0] * 0.75, 9);
  });

  it('makes attackers abandon concealed targets while concealed defenses keep firing', () => {
    const model = lateModel([
      lateBuilding(1, 'goldstorage', 20, 20, 10),
      lateBuilding(2, 'goldstorage', 30, 20, 10),
      lateBuilding(3, 'cannon', 20, 24, 10),
    ]);
    const b = model.battle!;
    const goblin = attacker(7, 'goblin', 18, 21, 1e9, 60);
    b.units.push(goblin);
    for (let i = 0; i < 4; i++) model.step(0.05);
    expect(goblin.target).toBe(1);
    covering(b, 'invisibility', 21.5, 21.5, b.elapsed - 0.4);
    model.step(0.05);
    expect(goblin.target).toBe(2);
    expect(goblin.path.length).toBeGreaterThan(0);
    // The concealed storage remains an obstacle for the new route.
    expect(goblin.path.some((p) => p.x > 20 && p.x < 23 && p.y > 20 && p.y < 23)).toBe(false);
    for (let i = 0; i < 20 && !b.projectiles?.some((p) => p.sourceId === 3); i++) model.step(0.05);
    expect(b.projectiles?.some((p) => p.sourceId === 3)).toBe(true);
  });

  it('never creates late state or effects before version 44', () => {
    const model = lateModel([lateBuilding(1, 'cannon', 20, 20, 10)], 43);
    expect(model.battle!.late).toBeUndefined();
  });
});
