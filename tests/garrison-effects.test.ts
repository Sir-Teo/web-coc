import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonImpactPoses } from '../src/game/garrison-effects';
import { hurtDefender } from '../src/game/defenders';

const setup = () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const defender = spawnGarrisonDefender(battle, 'balloon', 8, 1, 10, 10, 0);
  defender.attacks.push({ at: 1, x: 10, y: 10, targetId: 1, targetX: 11, targetY: 11 });
  return { battle, defender };
};
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
it('reconstructs source impact particles at the recorded self-centered blast after movement and seeks', () => {
  const { battle, defender } = setup();
  battle.elapsed = 0.99;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 1.05;
  const first = garrisonImpactPoses(battle, false, iso);
  expect(new Set(first.map((p) => p.emitter))).toEqual(
    new Set(['Wizard_Tower_lightFlash', 'Ring', 'Grass', 'Stone', 'Explosion_3']),
  );
  defender.x = 15;
  defender.y = 16;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual(first);
  const before = structuredClone(battle);
  expect(garrisonImpactPoses(JSON.parse(JSON.stringify(battle)), false, iso)).toEqual(first);
  expect(battle).toEqual(before);
  battle.elapsed = 10;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 1.05;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual(first);
});
it('gates the original death blast on damage resolution and its 416-ms delay', () => {
  const { battle, defender } = setup();
  defender.attacks = [];
  battle.elapsed = 2;
  hurtDefender(battle, defender, 1000);
  battle.elapsed = 2.5;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
  defender.deathResolved = true;
  battle.elapsed = 2.415;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
  battle.elapsed = 2.5;
  const poses = garrisonImpactPoses(battle, false, iso);
  expect(new Set(poses.map((p) => p.emitter))).toEqual(
    new Set([
      'Stone',
      'Grass',
      'Ring',
      'Wizard_Tower_lightFlash',
      'Explosion_3',
      'Fire_balls',
      'Smoke',
      'Balloon_Die_wood',
      'Balloon_Die_darkBloon',
    ]),
  );
  expect(new Set(poses.map((p) => p.key)).size).toBe(poses.length);
  expect(garrisonImpactPoses(battle, true, iso).map((p) => p.emitter)).toEqual(['Ring']);
  battle.elapsed = 5;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
  expect(garrisonImpactPoses(null, false, iso)).toEqual([]);
});

it('detaches Dragon fire at the recorded mouth position and removes it on death', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 20, 20, 0);
  dragon.attacks.push({ at: 1, x: 20, y: 20, targetId: 1, targetX: 22, targetY: 18 });
  battle.elapsed = 1.3;
  const fire = garrisonImpactPoses(battle, false, iso);
  expect(new Set(fire.map((p) => p.emitter))).toEqual(
    new Set(['dragonFire', 'dragonFireAdd', 'dragonSpark', 'dragonFireAddStart']),
  );
  expect(
    fire
      .filter((p) => p.emitter === 'dragonFireAdd')
      .some((p) => 'group' in p.poses[0] && p.poses[0].blend === 8),
  ).toBe(true);
  expect(
    fire.filter((p) => p.emitter === 'dragonFireAdd').some((p) => !('group' in p.poses[0])),
  ).toBe(true);
  dragon.x = 25;
  dragon.y = 25;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual(fire);
  expect(garrisonImpactPoses(battle, true, iso)).toEqual([]);
  const copy = JSON.parse(JSON.stringify(battle));
  expect(garrisonImpactPoses(copy, false, iso)).toEqual(fire);
  hurtDefender(battle, dragon, 4000);
  battle.elapsed = 1.4;
  expect(new Set(garrisonImpactPoses(battle, false, iso).map((p) => p.emitter))).toEqual(
    new Set(['SplatBig']),
  );
  battle.elapsed = 5;
  expect(garrisonImpactPoses(battle, false, iso)).toEqual([]);
});
