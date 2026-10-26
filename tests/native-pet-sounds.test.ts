import { expect, it } from 'vitest';
import source from '../reference/troop-sounds/sounds.json' with { type: 'json' };
import { PET_UNIT_KINDS, PET_UNIT_SOURCE, nativeUnitStats } from '../src/game/native-units';
import { GameModel, makeBuilding, type Battle, type Unit, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import {
  initialNativeState,
  stepNativeUnit,
  type NativeTroopContext,
} from '../src/game/native-troops';
import {
  troopSoundFiles,
  troopCue,
  troopSample,
  troopSoundCues,
  BattleSoundLog,
} from '../src/game/troop-sounds';
import { nativePhoenixRecording } from './fixtures/native-phoenix';

function arena() {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const battle = model.battle!;
  const unit = (kind: Unit['kind'], id = 1000) => {
    const stats = nativeUnitStats(kind, 1);
    const u: Unit = {
      id,
      kind,
      level: 1,
      x: 5,
      y: 5,
      hp: stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      spawnedAt: 0,
      native: initialNativeState(kind, 1),
    };
    battle.units.push(u);
    return u;
  };
  return { battle, unit };
}

it.each(PET_UNIT_KINDS)('imports the %s actor from its own pet row', (kind) => {
  expect((source.troops as Record<string, { name: string }>)[kind].name).toBe(
    PET_UNIT_SOURCE[kind],
  );
  const files = troopSoundFiles(kind);
  expect(files.length).toBeGreaterThan(0);
  expect(files.every((path) => path in source.sounds)).toBe(true);
});

it.each([
  ['unicorn', 'deploy', 'clash_pet_horse_dep_01.ogg', 0.9, 1, 1],
  ['unicorn', 'attack', 'clash_pet_horse_heal_01.ogg', 0.8, 0.95, 1.05],
  ['phoenix', 'deploy', 'pet_phoenix_deploy_01.ogg', 0.9, 1, 1],
  ['mightyyak', 'attack', 'clash_pet_yak_atk_01.ogg', 0.8, 0.95, 1.05],
  ['diggy', 'attack', 'diggy_atk_01.ogg', 0.6, 0.9, 1.1],
] as const)('uses source %s %s sample, volume and pitch', (kind, event, file, volume, min, max) => {
  const { battle, unit } = arena();
  const pet = unit(kind);
  const cue = troopCue(battle, pet, event, 'pet-source', 0.5)!;
  expect(cue).toMatchObject({ sample: troopSample('sfx/' + file), at: 0.5, volume });
  expect(cue.pitch).toBeGreaterThanOrEqual(min);
  expect(cue.pitch).toBeLessThanOrEqual(max);
  expect(troopCue(battle, pet, event, 'pet-source', 0.5)).toEqual(cue);
});

it('dates pet deployment and death from the actor without mutating battle state', () => {
  const { battle, unit } = arena();
  const pet = unit('mightyyak');
  const log = new BattleSoundLog();
  battle.elapsed = 0.5;
  pet.spawnedAt = 0.25;
  const before = JSON.stringify(battle);
  expect(troopSoundCues(battle, log).find((c) => c.key === `troop:${pet.id}:deploy`)).toMatchObject(
    { at: 0.25, volume: 0.8 },
  );
  expect(JSON.stringify(battle)).toBe(before);
  pet.hp = 0;
  pet.defeatedAt = 0.5;
  expect(troopSoundCues(battle, log).find((c) => c.key === `troop:${pet.id}:die`)!.sample).toBe(
    troopSample('sfx/clash_pet_yak_die_01.ogg'),
  );
});

it('keeps Phoenix silent in the Egg and plays deployment at hatch without an Egg death cue', () => {
  const r = nativePhoenixRecording();
  const waiting = structuredClone(r.snapshots[0].battle) as Battle;
  const hatched = structuredClone(r.snapshots[1].battle) as Battle;
  const sample = troopSample('sfx/pet_phoenix_deploy_01.ogg');
  expect(troopSoundCues(waiting, new BattleSoundLog()).filter((c) => c.sample === sample)).toEqual(
    [],
  );
  const before = JSON.stringify(hatched);
  const cues = troopSoundCues(hatched, new BattleSoundLog());
  expect(cues.filter((c) => c.sample === sample)).toMatchObject([
    { at: r.hatched, volume: 0.9, pitch: 1 },
  ]);
  expect(cues.some((c) => c.key === `troop:${r.eggId}:die`)).toBe(false);
  expect(JSON.stringify(hatched)).toBe(before);
});

it('labels native healing flights for the friendly sound path', () => {
  const { battle, unit } = arena();
  const pet = unit('unicorn'),
    hero = unit('barbarianking', 1001);
  hero.hero = 'king';
  hero.hp = 100;
  const events: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => 2000,
    troopLevel: () => 1,
    damageBuilding() {},
    effect: (fx) => events.push(fx),
  };
  stepNativeUnit(ctx, pet, nativeUnitStats('unicorn', 1), 0.05);
  expect(events).toContainEqual(
    expect.objectContaining({
      type: 'projectile',
      weapon: 'native',
      targetFriendly: true,
      sourceKind: 'unicorn',
      sourceId: pet.id,
      targetId: hero.id,
    }),
  );
});
