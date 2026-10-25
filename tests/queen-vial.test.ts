import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { queenVialBattle, queenVialRecording } from './fixtures/queen-vial';
import { defendingHero } from '../src/game/defending-heroes';
import { heroExtraDamage } from '../src/game/native-hero-abilities';
import { statsFor, stepNativeUnit, type NativeTroopContext } from '../src/game/native-troops';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function fire(model: GameModel, sourceId: number) {
  for (let remaining = 100; remaining > 0; remaining--) {
    model.step(0.05);
    const shot = model.battle!.projectiles?.find((p) => p.sourceId === sourceId);
    if (shot) return shot;
  }
  throw Error('Vial Queen did not fire');
}

it.each([
  [1, 340, 4.2],
  [6, 820, 5.4],
  [12, 1370, 6.6],
  [18, 1740, 7.8],
])(
  'adds level %s flat damage at launch and expires at its source deadline',
  (level, extra, until) => {
    const { model, unit, base } = queenVialBattle(level);
    model.activateNativeHeroAbility('queen');
    expect(heroExtraDamage(unit, 0)).toBe(extra);
    expect(heroExtraDamage(unit, until)).toBe(0);
    const shot = fire(model, unit.id);
    expect(shot.damage).toBe(base.damage + extra);
    expect(unit.native?.effects?.invisibleUntil).toBe(until);
  },
);

it.each([false, true])(
  'adds the captured bonus to a committed air=%s defending Hero hit',
  (air) => {
    const { model, battle, unit, base } = queenVialBattle();
    battle.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
    const d = defendingHero(
      { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 7.5, y: 6.5 },
      0,
    );
    d.alerted = true;
    battle.defenders = [d];
    unit.defenderTarget = d.id;
    model.activateNativeHeroAbility('queen');
    const shot = fire(model, unit.id);
    expect(shot.targetDefender).toBe(true);
    expect(shot.toAir).toBe(air);
    expect(shot.damage).toBe(base.damage + 340);
  },
);

it('keeps Frozen Arrow frost while adding Vial damage', () => {
  const { model, unit, base } = queenVialBattle(1, false, 80, [{ slug: 'frozen-arrow', level: 1 }]);
  model.activateNativeHeroAbility('queen');
  const shot = fire(model, unit.id);
  expect(shot.damage).toBe(base.damage + 340);
  expect(shot.native?.name).toBe('QueenFrostyProjectile');
  expect(shot.native?.frost).toEqual({ seconds: 0.75, percent: 0.25 });
});

it('does not grant the original Queen bonus to an unrostered copy', () => {
  const { model, battle, unit } = queenVialBattle();
  model.activateNativeHeroAbility('queen');
  unit.id = 3000;
  const target = battle.buildings[1];
  unit.target = target.id;
  unit.native!.targetAt = -100;
  battle.elapsed = 1;
  const stats = statsFor(battle, unit);
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 4000,
    troopLevel: () => 1,
    damageBuilding: () => {},
    effect: () => {},
  };
  stepNativeUnit(ctx, unit, { damage: stats.damage, speed: stats.speed }, 0.05);
  expect(battle.projectiles!.find((p) => p.sourceId === unit.id)!.damage).toBe(stats.damage);
});

it('preserves version 79 Vial shots without the damage bonus', () => {
  const { model, unit, base } = queenVialBattle(18, false, 79);
  model.activateNativeHeroAbility('queen');
  expect(fire(model, unit.id).damage).toBe(base.damage);
});

for (const recall of [false, true])
  it.each([1, 18])(
    `reconstructs level %s Vial shots through ${recall ? 'Recall' : 'expiry'} and portable backward seeks`,
    (level) => {
      const { data, snapshots, shots, final, expiry, recallAt, unitId, baseDamage } =
        queenVialRecording(level, recall);
      const extra = level === 1 ? 340 : 1740;
      for (const { projectile, bonus } of shots) expect(projectile.damage).toBe(baseDamage + bonus);
      expect(shots[0].bonus).toBe(extra);
      if (recall) expect(shots.at(-1)!.projectile.impact).toBeGreaterThan(recallAt!);
      else expect(shots.some((s) => s.projectile.launched >= expiry && s.bonus === 0)).toBe(true);
      const viewer = new GameModel();
      expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
      for (const snapshot of [...snapshots].reverse()) {
        viewer.seekReplay(snapshot.at);
        while (viewer.replay!.seeking) viewer.step(0.05);
        expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
      }
      if (recall)
        expect((snapshots.at(-1)!.battle as Battle).units.some((u) => u.id === unitId)).toBe(false);
      expect(viewer.openReplay({ ...data, version: 79 })).toBe(true);
      viewer.seekReplay(final);
      while (viewer.replay!.seeking) viewer.step(0.05);
      const damage = (b: Battle) => b.buildings.reduce((sum, b) => sum + b.maxHp - b.hp, 0);
      expect(damage(viewer.battle!)).toBeLessThan(damage(snapshots.at(-1)!.battle as Battle));
    },
  );
