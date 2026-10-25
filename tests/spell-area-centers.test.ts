import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import {
  castNativeSpell,
  stepNativeSpells,
  spellRandom,
  type NativeSpellContext,
} from '../src/game/native-spells';
import { nativeRow, tiles } from '../src/game/native-data';
import { defendingHero } from '../src/game/defending-heroes';
import { spellAreaCenterRecording } from './fixtures/spell-area-centers';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { validateReplay } from '../src/game/replay';

function unit(id: number, x: number, y: number): Unit {
  return {
    id,
    kind: 'giant',
    x,
    y,
    hp: 100,
    maxHp: 1000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
}
function arena(seed = 0, legacy = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.state.king = undefined;
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.seed = seed;
  if (legacy) delete battle.nativeSpellAreaCenters;
  const effects: FX[] = [];
  const ctx: NativeSpellContext = {
    battle,
    damageBuilding: (building, amount) => {
      building.hp = Math.max(0, building.hp - amount);
    },
    effect: (effect) => effects.push(effect),
  };
  const pulse = (name: string, follow?: number) => {
    const cast = castNativeSpell(battle, name, 1, 'attack', 20, 20, { follow });
    battle.elapsed = cast.firstHit;
    stepNativeSpells(ctx);
    return cast;
  };
  return { battle, ctx, effects, pulse };
}

it.each(['Rage', 'Haste', 'Healing', 'Invisibility'])(
  '%s affects units inside its aimed circle and excludes units outside it across seeds',
  (name) => {
    const radius = tiles(nativeRow('spells', name), 'Radius');
    for (const seed of [0, 1, 7, 1337, 100000]) {
      const { battle, pulse } = arena(seed);
      const inside = unit(100, 20 + radius - 0.01, 20);
      const outside = unit(101, 20 + radius + 0.01, 20);
      battle.units = [inside, outside];
      pulse(name);
      if (name === 'Healing') {
        expect(inside.hp, `seed ${seed}`).toBeGreaterThan(100);
        expect(outside.hp, `seed ${seed}`).toBe(100);
      } else {
        const read = (u: Unit) =>
          name === 'Invisibility'
            ? u.native?.effects?.invisibleUntil
            : u.native?.effects?.boost?.until;
        expect(read(inside), `seed ${seed}`).toBeGreaterThan(battle.elapsed);
        expect(read(outside), `seed ${seed}`).toBeUndefined();
      }
    }
  },
);

it('Freeze uses the aimed footprint and unit radius regardless of visual scatter', () => {
  for (const seed of [0, 1, 7, 1337, 100000]) {
    const { battle, pulse } = arena(seed);
    const inside = makeBuilding(2, 'cannon', 23, 19, 1);
    const outside = makeBuilding(3, 'cannon', 24, 19, 1);
    battle.buildings.push(inside, outside);
    battle.defenders = [
      defendingHero({ kind: 'king', level: 1, x: 23.49, y: 20 }, 0),
      defendingHero({ kind: 'king', level: 1, x: 23.51, y: 20 }, 1),
    ];
    pulse('Freeze');
    expect(battle.defenseStuns[inside.id], `seed ${seed}`).toBe(battle.elapsed + 2.5);
    expect(battle.defenseStuns[outside.id], `seed ${seed}`).toBeUndefined();
    expect(battle.defenders[0].stunnedUntil, `seed ${seed}`).toBe(battle.elapsed + 2.5);
    expect(battle.defenders[1].stunnedUntil, `seed ${seed}`).toBeUndefined();
  }
});

it.each(['Earthquake', 'Overgrowth'])(
  '%s respects the aimed building footprint boundary',
  (name) => {
    const radius = tiles(nativeRow('spells', name), 'Radius');
    for (const seed of [0, 1, 7, 1337, 100000]) {
      const { battle, pulse } = arena(seed);
      const inside = makeBuilding(2, 'cannon', Math.floor(20 + radius), 19, 1);
      const outside = makeBuilding(3, 'cannon', Math.floor(20 + radius) + 1, 19, 1);
      battle.buildings.push(inside, outside);
      pulse(name);
      if (name === 'Earthquake') {
        expect(inside.hp, `seed ${seed}`).toBeLessThan(inside.maxHp);
        expect(outside.hp, `seed ${seed}`).toBe(outside.maxHp);
      } else {
        expect(battle.buildingEffects?.[inside.id]?.overgrownUntil, `seed ${seed}`).toBeGreaterThan(
          battle.elapsed,
        );
        expect(
          battle.buildingEffects?.[outside.id]?.overgrownUntil,
          `seed ${seed}`,
        ).toBeUndefined();
      }
    }
  },
);

it('uses the live following owner as the center of a Rage Gem aura', () => {
  const { battle, pulse } = arena(7);
  const radius = tiles(nativeRow('spells', 'Rage Gem Aura'), 'Radius');
  const owner = unit(100, 24, 20);
  const inside = unit(101, owner.x + radius - 0.01, 20);
  const outside = unit(102, owner.x + radius + 0.01, 20);
  battle.units = [owner, inside, outside];
  const cast = pulse('Rage Gem Aura', owner.id);
  expect(cast.x).toBe(owner.x);
  expect(inside.native?.effects?.boost?.until).toBeGreaterThan(battle.elapsed);
  expect(outside.native?.effects?.boost).toBeUndefined();
});

it.each(['Spell Tower Rage', 'Spell Tower Invisibility'])(
  '%s keeps defensive building effects inside the aimed area',
  (name) => {
    const radius = tiles(nativeRow('spells', name), 'Radius');
    for (const seed of [0, 1, 7, 1337, 100000]) {
      const { battle, ctx } = arena(seed);
      const inside = makeBuilding(2, 'cannon', Math.floor(20 + radius), 19, 1);
      const outside = makeBuilding(3, 'cannon', Math.floor(20 + radius) + 1, 19, 1);
      battle.buildings.push(inside, outside);
      const cast = castNativeSpell(battle, name, 1, 'defense', 20, 20);
      battle.elapsed = cast.firstHit;
      stepNativeSpells(ctx);
      const effect = (id: number) =>
        name === 'Spell Tower Rage'
          ? battle.buildingEffects?.[id]?.boost?.until
          : battle.buildingEffects?.[id]?.invisibleUntil;
      expect(effect(inside.id), `seed ${seed}`).toBeGreaterThan(battle.elapsed);
      expect(effect(outside.id), `seed ${seed}`).toBeUndefined();
    }
  },
);

it('retains the older random center and preserves feedback pulse cadence', () => {
  const { battle, ctx, effects } = arena(0, true);
  const row = nativeRow('spells', 'Rage');
  const cast = castNativeSpell(battle, 'Rage', 1, 'attack', 20, 20);
  const angle = spellRandom(cast.seed, 0) * Math.PI * 2;
  const reach = Math.sqrt(spellRandom(cast.seed, 1)) * tiles(row, 'RandomRadius');
  expect(reach).toBeGreaterThan(0.1);
  const inside = unit(100, 20 - Math.cos(angle) * 4.99, 20 - Math.sin(angle) * 4.99);
  const outside = unit(101, 20 + Math.cos(angle) * 5.01, 20 + Math.sin(angle) * 5.01);
  battle.units = [inside, outside];
  battle.elapsed = cast.firstHit;
  stepNativeSpells(ctx);
  expect(inside.native?.effects?.boost).toBeUndefined();
  expect(outside.native?.effects?.boost?.until).toBeGreaterThan(battle.elapsed);
  expect(effects.filter((effect) => effect.type === 'spell-native')).toHaveLength(1);
  const modern = arena(0);
  modern.battle.units = [unit(100, inside.x, inside.y), unit(101, outside.x, outside.y)];
  const centered = modern.pulse('Rage');
  modern.battle.elapsed = centered.firstHit + centered.interval;
  stepNativeSpells(modern.ctx);
  expect(modern.battle.units[0].native?.effects?.boost?.until).toBeGreaterThan(
    modern.battle.elapsed,
  );
  expect(modern.battle.units[1].native?.effects?.boost).toBeUndefined();
  const feedback = modern.effects.filter((effect) => effect.type === 'spell-native');
  expect(feedback).toHaveLength(2);
  expect(feedback.every((effect) => effect.x === 20 && effect.y === 20)).toBe(true);
});

it('reconstructs a real Rage boundary through portable backward seeks and keeps version 74', () => {
  const { data, snapshots, before, hit, giantId } = spellAreaCenterRecording();
  expect(validateReplay(data)).toBe(true);
  const viewer = new GameModel();
  expect(viewer.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(data))))).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    while (viewer.replay!.seeking) viewer.step(0.05);
  };
  for (const snapshot of [...snapshots].reverse()) {
    seek(snapshot.at);
    expect(JSON.parse(JSON.stringify(viewer.battle))).toEqual(snapshot.battle);
  }
  const boosted = () =>
    viewer.battle!.units.find((unit) => unit.id === giantId)!.native?.effects?.boost;
  seek(before);
  expect(boosted()).toBeUndefined();
  seek(hit);
  expect(boosted()?.damage).toBeCloseTo(1.3, 12);
  expect(viewer.openReplay({ ...data, version: 74 })).toBe(true);
  seek(hit);
  expect(boosted()).toBeUndefined();
});

it('keeps Electro Dragon death lightning scattered exactly as before', () => {
  const old = arena(7, true);
  const modern = arena(7);
  for (const a of [old, modern]) {
    const cast = castNativeSpell(a.battle, 'ElectroDragonDie', 1, 'attack', 20, 20);
    a.battle.elapsed = cast.firstHit + (cast.total - 1) * cast.interval;
    stepNativeSpells(a.ctx);
  }
  expect(modern.effects).toEqual(old.effects);
  const strikes = modern.effects.filter((effect) => effect.type === 'spell-native');
  expect(strikes.length).toBeGreaterThan(1);
  expect(strikes.some((effect) => effect.x !== 20 || effect.y !== 20)).toBe(true);
});
