import { expect, it } from 'vitest';
import { GameModel, type Battle } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { nativeProjectilePack } from '../src/game/native-projectile-poses';
import { createGuardian } from '../src/game/native-guardians';
import { headhunterHeroBattle, headhunterHeroRecording } from './fixtures/headhunter-hero-rules';

function arena(level = 1) {
  const { model, battle } = headhunterHeroBattle(level);
  const hero = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  hero.stunnedUntil = 100;
  model.activeTroop = 'headhunter';
  expect(model.deploy(5, 5)).toBe(true);
  model.step(0.05);
  const shot = battle.projectiles!.find((shot) => shot.sourceId === battle.units[0].id)!;
  return { model, battle, hero, shot };
}

it.each([1, 2, 3, 4])(
  'level %s launches its retained native card at 14 tiles per second',
  (level) => {
    const { shot } = arena(level);
    expect(shot.weapon).toBe('native');
    expect(shot.native).toEqual({ name: `Headhunter_Card_lvl${level}`, kind: 'headhunter', level });
    expect(nativeProjectilePack(shot.native!.name)).toBe(
      'assets/projectiles-native/headhunter-card-lvl1/graph.json',
    );
    expect(shot.impact - shot.launched).toBeCloseTo(2.5 / 14, 12);
  },
);

it.each([false, true])(
  'uses native impact timing on an air=%s Hero and preserves version 73 arrows',
  (air) => {
    const { data, snapshots, flight, hit, unitId, defenderId } = headhunterHeroRecording(air);
    const flightState = snapshots[0].battle as Battle;
    const shot = flightState.projectiles!.find((shot) => shot.sourceId === unitId)!;
    const at = shot.launched + 0.15;
    expect(shot.impact).toBeGreaterThan(at);
    const viewer = new GameModel();
    expect(viewer.openReplay(data)).toBe(true);
    const loss = () => {
      const hero = viewer.battle!.defenders!.find((defender) => defender.id === defenderId)!;
      return hero.maxHp - hero.hp;
    };
    const seek = (at: number) => {
      viewer.seekReplay(at);
      while (viewer.replay!.seeking) viewer.step(0.05);
    };
    seek(at);
    expect(loss()).toBe(0);
    seek(hit);
    expect(loss()).toBe(252);
    seek(flight);
    expect(viewer.battle!.projectiles!.find((shot) => shot.sourceId === unitId)!.native?.name).toBe(
      'Headhunter_Card_lvl1',
    );
    expect(viewer.openReplay({ ...data, version: 73 })).toBe(true);
    seek(flight);
    const older = viewer.battle!.projectiles!.find((shot) => shot.sourceId === unitId)!;
    expect(older.weapon).toBe('arrow');
    expect(older.native).toBeUndefined();
    expect(older.impact - older.launched).toBeCloseTo(2.5 / 18, 12);
    seek(at);
    expect(loss()).toBe(252);
  },
);

it('lands a native card after its Headhunter is removed', () => {
  const { model, battle, hero, shot } = arena();
  battle.units = [];
  while (battle.elapsed < shot.impact + 1e-9) model.step(0.05);
  expect(hero.maxHp - hero.hp).toBe(252);
});

it.each(['archer', 'dragon', 'guardian'] as const)(
  'lands normal card damage on a defending %s',
  (kind) => {
    const { model, battle } = headhunterHeroBattle();
    battle.defenders!.find((defender) => defender.kind === 'hero')!.hp = 0;
    const defender =
      kind === 'guardian'
        ? createGuardian(battle, { ...battle.buildings[0], guardian: 'smasher' }, -20000)!
        : spawnGarrisonDefender(battle, kind, kind === 'archer' ? 9 : 5, 1, 7.5, 5, 0);
    if (defender.kind === 'guardian') {
      defender.x = 7.5;
      defender.y = 5;
      defender.phase = 'fighting';
      defender.spawnedAt = 0;
      battle.defenders!.push(defender);
    }
    defender.alerted = true;
    defender.stunnedUntil = 100;
    model.activeTroop = 'headhunter';
    expect(model.deploy(5, 5)).toBe(true);
    model.step(0.05);
    const shot = battle.projectiles!.find((shot) => shot.sourceId === battle.units[0].id)!;
    expect(shot.weapon).toBe('native');
    expect(shot.targetId).toBe(defender.id);
    expect(shot.damage).toBe(63);
    while (battle.elapsed < shot.impact + 1e-9) model.step(0.05);
    expect(defender.maxHp - defender.hp).toBe(Math.min(63, defender.maxHp));
  },
);

it('does not transfer a native card from a fallen Hero to another defender', () => {
  const { model, battle, hero, shot } = arena();
  hero.hp = 0;
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, hero.x, hero.y, 0);
  archer.stunnedUntil = 100;
  while (battle.elapsed < shot.impact + 1e-9) model.step(0.05);
  expect(archer.hp).toBe(archer.maxHp);
});
