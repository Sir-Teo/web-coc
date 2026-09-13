import { isDefense } from '../src/game/data';
import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { hurtDefender, stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { unitPose } from '../src/game/unit-pose';
import { kingPose } from '../src/game/king-art';

function fixture() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.units = [];
  return battle;
}
const unit = (id: number, kind: Unit['kind'], x = 10, y = 10): Unit => ({
  id,
  kind,
  x,
  y,
  hp: 5000,
  maxHp: 5000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
});
const advance = (battle: ReturnType<typeof fixture>, seconds: number) => {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    battle.elapsed += 0.05;
    stepDefenders(battle, 0.05, () => {});
  }
};

it('Dragon can select air targets while splash stays on the selected layer', () => {
  const battle = fixture();
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 8, 10, 0);
  battle.units = [unit(1, 'dragon'), unit(2, 'giant', 10.2), unit(3, 'archer', 10.4)];
  advance(battle, 1.25);
  expect(dragon.hp).toBe(3900);
  expect(battle.units.map((u) => u.hp)).toEqual([4612.5, 5000, 5000]);
  expect(dragon.attacks).toHaveLength(1);
  advance(battle, 1.2);
  expect(dragon.attacks).toHaveLength(1);
  advance(battle, 0.05);
  expect(dragon.attacks).toHaveLength(2);
});

it('Balloon ignores air units and converts its initial charge into a 750ms windup', () => {
  const battle = fixture();
  const balloon = spawnGarrisonDefender(battle, 'balloon', 8, 1, 10, 10, 0);
  battle.units = [
    unit(1, 'dragon'),
    unit(2, 'giant'),
    unit(3, 'archer', 11),
    unit(4, 'archer', 11.3),
  ];
  advance(battle, 0.7);
  expect(balloon.attacks).toHaveLength(0);
  advance(battle, 0.05);
  expect(balloon.attacks).toHaveLength(1);
  expect(battle.units.map((u) => u.hp)).toEqual([5000, 4292, 4292, 5000]);
  advance(battle, 3);
  expect(balloon.attacks).toHaveLength(2);
});

it('Balloon death explodes once after 416ms and excludes air and later births', () => {
  const battle = fixture();
  const balloon = spawnGarrisonDefender(battle, 'balloon', 8, 1, 10, 10, 0);
  battle.units = [unit(1, 'giant'), unit(2, 'dragon'), { ...unit(3, 'archer'), spawnedAt: 0.43 }];
  hurtDefender(battle, balloon, 1000);
  advance(battle, 0.4);
  expect(battle.units.map((u) => u.hp)).toEqual([5000, 5000, 5000]);
  advance(battle, 0.05);
  expect(battle.units.map((u) => u.hp)).toEqual([4732, 5000, 5000]);
  advance(battle, 1);
  expect(battle.units[0].hp).toBe(4732);
  expect(balloon.deathResolved).toBe(true);
});

it('new defenders respect birth and stun boundaries and never chase dead or ejected units', () => {
  const battle = fixture();
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 0, 0, 1);
  battle.units = [
    { ...unit(1, 'giant', 0, 0), hp: 0 },
    { ...unit(2, 'archer', 0, 0), ejected: true },
    { ...unit(3, 'archer', 0, 0), spawnedAt: 20 },
    unit(4, 'archer', 10, 0),
  ];
  hurtDefender(battle, dragon, 4000);
  expect(dragon.hp).toBe(3900);
  advance(battle, 0.5);
  expect(dragon.x).toBe(0);
  dragon.stunnedUntil = 1.5;
  advance(battle, 1);
  expect(dragon.x).toBeCloseTo(0);
  advance(battle, 0.5);
  expect(dragon.x).toBeCloseTo(1);
  expect(dragon.target).toBe(4);
});

it('retains deterministic combat/death state through JSON restoration', () => {
  const battle = fixture();
  spawnGarrisonDefender(battle, 'dragon', 7, 1, 8, 10, 0);
  spawnGarrisonDefender(battle, 'balloon', 8, 1, 10, 10, 0);
  battle.units = [unit(1, 'giant')];
  advance(battle, 0.5);
  const restored = JSON.parse(JSON.stringify(battle));
  advance(battle, 4);
  advance(restored, 4);
  expect(restored).toEqual(battle);
});

it('connects to the live model step and existing attacker retaliation/projectile damage', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  expect(model.deploy(1, 1)).toBe(true);
  const battle = model.battle!;
  battle.buildings = battle.buildings.filter((b) => !isDefense(b.kind));
  battle.units = [unit(1, 'archer')];
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 8, 10, 0);
  for (let i = 0; i < 25; i++) model.step(0.05);
  expect(battle.units[0].hp).toBe(4612.5);
  expect(battle.units[0].defenderTarget).toBe(dragon.id);
  let retaliationShot = false;
  for (let i = 0; i < 40; i++) {
    model.step(0.05);
    retaliationShot ||= !!battle.projectiles?.some(
      (p) => p.targetDefender && p.targetId === dragon.id,
    );
  }
  expect(retaliationShot).toBe(true);
  expect(dragon.hp).toBeLessThan(3900);
});

it('aims at leveled defenders as troop points rather than building footprints', () => {
  const battle = fixture();
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 10, 10, 0);
  const attacker = { ...unit(1, 'archer', 11, 12), attacking: true };
  const point = unit(2, 'dragon', 10, 10);
  expect(unitPose(attacker, dragon)).toEqual(unitPose(attacker, point));
  expect(kingPose(attacker, dragon, 1, 1, false)).toEqual(kingPose(attacker, point, 1, 1, false));
});

it('Lightning cannot damage or stun a garrison defender before its scheduled birth', () => {
  const model = new GameModel();
  model.state.spells.lightning = 1;
  model.startBattle(0, true);
  const dragon = spawnGarrisonDefender(model.battle!, 'dragon', 7, 1, 10, 10, 1);
  model.activeSpell = 'lightning';
  expect(model.castSpell(10, 10)).toBe(true);
  expect(dragon.hp).toBe(3900);
  expect(dragon.stunnedUntil).toBeUndefined();
});
