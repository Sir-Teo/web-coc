import { expect, it } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { seconds } from '../src/game/native-data';
import { spellRow } from '../src/game/native-spells';

function repairArena() {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'builder', 20, 20, 4),
    makeBuilding(3, 'cannon', 23, 20, 10),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), freeze: 2 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.started = true;
  const target = battle.buildings.find((building) => building.id === 3)!;
  model.damage(target, target.hp * 0.8);
  for (let step = 0; step < 100 && !battle.late?.defendingBuilder?.builders[0]?.repairing; step++)
    model.step(0.05);
  const builder = battle.late!.defendingBuilder!.builders[0];
  expect(builder.repairing).toBe(true);
  return { model, battle, builder, target };
}

it('stops a repairing Builder during the actual Freeze Spell effect and resumes afterwards', () => {
  const { model, battle, builder } = repairArena();
  model.activeSpell = 'freeze';
  expect(model.castSpell(builder.x, builder.y)).toBe(true);
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Freeze')!;
  expect(cast).toBeDefined();
  const until = cast.firstHit + seconds(spellRow('Freeze', cast.level), 'FreezeTimeMS');
  while (battle.elapsed < cast.firstHit + 0.05) model.step(0.05);
  const repairs = builder.repairCount;
  const position = [builder.x, builder.y];
  while (battle.elapsed < until - 0.1) model.step(0.05);
  expect(builder.repairCount).toBe(repairs);
  expect([builder.x, builder.y]).toEqual(position);
  for (let step = 0; step < 60 && builder.repairCount === repairs; step++) model.step(0.05);
  expect(builder.repairCount).toBeGreaterThan(repairs);
});

it('leaves version-56 Builder behavior unchanged when the same Freeze Spell lands', () => {
  const { model, battle, builder } = repairArena();
  delete battle.nativeBuilderFreeze;
  model.activeSpell = 'freeze';
  expect(model.castSpell(builder.x, builder.y)).toBe(true);
  const cast = battle.nativeSpells!.find((spell) => spell.name === 'Freeze')!;
  while (battle.elapsed < cast.firstHit + 0.05) model.step(0.05);
  const before = builder.repairCount;
  for (let i = 0; i < 30; i++) model.step(0.05);
  expect(builder.freeze).toBeUndefined();
  expect(builder.repairCount).toBeGreaterThan(before);
});

it('uses the Builder position, excludes workers still inside or hidden, and only extends overlaps', async () => {
  const { freezeDefendingBuilders } = await import('../src/game/defending-builder-freeze');
  const { battle, builder } = repairArena();
  const other = structuredClone(builder);
  other.id = 2;
  other.x += 10;
  const unborn = { ...structuredClone(builder), id: 3, spawnedAt: battle.elapsed + 1 };
  const hidden = { ...structuredClone(builder), id: 4, hiddenAt: battle.elapsed };
  battle.late!.defendingBuilder!.builders.push(other, unborn, hidden);
  const at = battle.elapsed;
  freezeDefendingBuilders(battle, builder.x, builder.y, 2, at, 4);
  expect(builder.freeze).toEqual({ since: at, until: at + 4, timeLost: 0 });
  for (const skipped of [other, unborn, hidden]) expect(skipped.freeze).toBeUndefined();
  freezeDefendingBuilders(battle, builder.x, builder.y, 2, at + 0.5, 1);
  expect(builder.freeze!.until).toBe(at + 4);
  freezeDefendingBuilders(battle, builder.x, builder.y, 2, at + 1, 4);
  expect(builder.freeze).toEqual({ since: at, until: at + 5, timeLost: 0 });
});

it('subtracts only frozen portions of boundary steps and preserves the repair countdown', async () => {
  const { defendingBuilderActiveTime } = await import('../src/game/defending-builder-freeze');
  const { battle, builder } = repairArena();
  builder.freeze = { since: 1.025, until: 2.025, timeLost: 0 };
  expect(defendingBuilderActiveTime(builder, 1, 1.05)).toBeCloseTo(0.025, 9);
  expect(defendingBuilderActiveTime(builder, 1.05, 2)).toBe(0);
  expect(defendingBuilderActiveTime(builder, 2, 2.05)).toBeCloseTo(0.025, 9);
  expect(builder.freeze.timeLost).toBeCloseTo(1, 9);
  const { freezeDefendingBuilders } = await import('../src/game/defending-builder-freeze');
  freezeDefendingBuilders(battle, builder.x, builder.y, 2, battle.elapsed, 2);
  const countdown = [builder.cooldown, builder.recovery];
  // The complete step lies inside the current freeze.
  const { stepDefendingBuilders } = await import('../src/game/defending-builder');
  battle.elapsed += 0.05;
  stepDefendingBuilders(battle, 0.05);
  expect([builder.cooldown, builder.recovery]).toEqual(countdown);
});

it('holds a walking Builder in place and keeps native body poses fixed until thawing', async () => {
  const { loadCharacterArt } = await import('../src/game/character-art');
  const { defendingBuilderPose } = await import('../src/game/defending-builder-poses');
  const { freezeDefendingBuilders } = await import('../src/game/defending-builder-freeze');
  const { stepDefendingBuilders } = await import('../src/game/defending-builder');
  await loadCharacterArt();
  const { battle, builder } = repairArena();
  builder.x = 20;
  builder.y = 21;
  builder.path = [{ x: 23, y: 21 }];
  builder.repairing = false;
  delete builder.engaged;
  const start = battle.elapsed;
  freezeDefendingBuilders(battle, 20, 21, 2, start, 1);
  const position = [builder.x, builder.y];
  const pose = defendingBuilderPose(builder, battle);
  for (let step = 0; step < 10; step++) {
    battle.elapsed += 0.05;
    stepDefendingBuilders(battle, 0.05);
    expect([builder.x, builder.y]).toEqual(position);
    expect(defendingBuilderPose(builder, battle)).toEqual(pose);
  }
  for (let step = 0; step < 15; step++) {
    battle.elapsed += 0.05;
    stepDefendingBuilders(battle, 0.05);
  }
  expect([builder.x, builder.y]).not.toEqual(position);
});
