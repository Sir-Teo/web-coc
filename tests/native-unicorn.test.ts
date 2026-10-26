import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells, defaultSpellLevels } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import type { HeroKind } from '../src/game/native-hero-data';
import { nativeUnitStats } from '../src/game/native-units';
import {
  initialNativeState,
  stepNativeUnit,
  type NativeTroopContext,
  resolveNativeImpact,
} from '../src/game/native-troops';
import { stepProjectiles } from '../src/game/projectiles';
import { healerContribution } from '../src/game/healing';
import { nativeUnicornRecording } from './fixtures/native-unicorn';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function arena(
  kind: HeroKind = 'king',
  level = 1,
  version = REPLAY_VERSION,
  reserve = true,
  earlierHealers = false,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.nextId = 1000;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1, healer: earlierHealers ? 2 : 0 };
  model.state.spells = { ...emptySpells(), revive: 1, recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [{ kind, level: 1, items: [], pet: { kind: 'unicorn', level } }];
  if (!reserve) {
    data.initial.army.giant = 0;
    data.initial.spells = emptySpells();
  }
  const battle = (model.battle = replayBattle(data.initial, version));
  if (earlierHealers) {
    model.activeTroop = 'healer';
    expect(model.deploy(5, 6.5) && model.deploy(5, 6.5)).toBe(true);
  }
  expect(model.deployNativeHero(kind, 5, 6.5)).toBe(true);
  const owner = battle.nativeHeroes![0];
  const hero = battle.units.find((u) => u.id === owner.unitId)!;
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  const unit = (kind: Unit['kind'], x = 5, y = 6.5) => {
    const stats = nativeUnitStats(kind, 1);
    const result: Unit = {
      id: model.state.nextId++,
      kind,
      level: 1,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      native: initialNativeState(kind, 1),
    };
    battle.units.push(result);
    return result;
  };
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, amount) => {
      b.hp -= amount;
    },
    effect() {},
  };
  const heal = () => {
    pet.cooldown = 0;
    stepNativeUnit(ctx, pet, nativeUnitStats('unicorn', level), 0.05);
    const shot = battle.projectiles?.find((p) => p.native?.healing && p.sourceId === pet.id);
    if (shot) {
      battle.elapsed = shot.impact;
      stepProjectiles(battle, ctx.damageBuilding, ctx.effect, (p) => resolveNativeImpact(ctx, p));
    }
  };
  const until = (at: number) => {
    for (let count = 0; battle.elapsed < at - 1e-9; count++) {
      if (battle.finished || count > 1000) throw Error('Unicorn checkpoint not reached');
      model.step(0.05);
    }
  };
  return { model, battle, owner, hero, pet, unit, ctx, heal, until };
}

it.each(['king', 'queen', 'warden', 'champion', 'prince', 'duke'] as const)(
  'keeps its full-health %s Hero instead of an injured cached ally',
  (kind) => {
    for (const version of [98, 99]) {
      const { hero, pet, unit, heal } = arena(kind, 1, version);
      const giant = unit('giant');
      giant.hp = 100;
      pet.healTarget = giant.id;
      heal();
      expect(pet.healTarget).toBe(version >= 99 ? hero.id : giant.id);
      expect(giant.hp).toBe(version >= 99 ? 100 : 150);
      expect(hero.hp).toBe(hero.maxHp);
    }
  },
);

it.each([1, 10, 15])('heals its Hero at the full level %s source rate', (level) => {
  const { hero, pet, unit, heal } = arena('king', level);
  hero.hp = 100;
  const giant = unit('giant');
  giant.hp = 1;
  heal();
  expect(pet.healTarget).toBe(hero.id);
  expect(hero.hp - 100).toBe(nativeUnitStats('unicorn', level).heal);
  expect(giant.hp).toBe(1);
});

it('keeps healing an invisible assigned Hero', () => {
  const { hero, pet, heal } = arena('queen');
  hero.hp = 100;
  hero.native!.effects = { invisibleUntil: 10 };
  heal();
  expect(pet.healTarget).toBe(hero.id);
  expect(hero.hp).toBe(150);
});

it('preserves the fallback after knockout and rebinds to its Hero after a real Revive', () => {
  const { model, battle, owner, hero, pet, unit, heal, until } = arena();
  const giant = unit('giant');
  giant.hp = 100;
  owner.abilityUsed = true;
  hero.hp = 0;
  pet.healTarget = hero.id;
  heal();
  expect(pet.healTarget).toBe(giant.id);
  expect(giant.hp).toBe(150);
  model.activeSpell = 'revive';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  until(battle.elapsed + 1.6);
  expect(hero.hp).toBeGreaterThan(0);
  expect(pet.healTarget).toBe(hero.id);
});

it('binds to the new Hero body after Recall and redeployment', () => {
  const { model, battle, owner, hero, until } = arena('warden');
  const previous = hero.id;
  model.activeSpell = 'recall';
  expect(model.castSpell(hero.x, hero.y)).toBe(true);
  until(2);
  expect(owner.unitId).toBeNull();
  expect(model.deployNativeHero('warden', 5, 12)).toBe(true);
  until(battle.elapsed + 0.05);
  const pet = battle.units.find((u) => u.id === owner.petId)!;
  expect(owner.unitId).not.toBe(previous);
  expect(pet.healTarget).toBe(owner.unitId);
});

it('counts Unicorn only for its single recipient and within its own healing range', () => {
  for (const version of [98, 99]) {
    const { battle, hero, pet, unit } = arena('king', 1, version);
    const giant = unit('giant', hero.x + 0.5);
    const first = unit('healer', hero.x - 3),
      second = unit('healer', hero.x - 3);
    first.healTarget = second.healTarget = giant.id;
    pet.healTarget = hero.id;
    expect(healerContribution(battle, giant, second.id)).toBe(version >= 99 ? 1 : 0.9);
    expect(healerContribution(battle, hero, second.id)).toBe(0.9);
    pet.x = hero.x + 3;
    pet.y = hero.y;
    expect(healerContribution(battle, hero, second.id)).toBe(version >= 99 ? 1 : 0.9);
  }
});

it('applies the shared diminishing curve to Unicorn healing after two earlier sources', () => {
  for (const version of [98, 99]) {
    const { battle, hero, pet, heal } = arena('king', 1, version, true, true);
    hero.hp = 100;
    for (const healer of battle.units.filter((u) => u.kind === 'healer'))
      healer.healTarget = hero.id;
    heal();
    expect(pet.healTarget).toBe(hero.id);
    expect(hero.hp - 100).toBe(version >= 99 ? 45 : 50);
  }
});

it('does not count recalled healers as active sources for a Unicorn pulse', () => {
  const { battle, hero, heal } = arena('king', 1, undefined, true, true);
  hero.hp = 100;
  for (const healer of battle.units.filter((u) => u.kind === 'healer')) {
    healer.healTarget = hero.id;
    (healer.native ??= {}).recalled = true;
  }
  heal();
  expect(hero.hp).toBe(150);
});

it('keeps the battle open with only Unicorn, preserving historical support-only completion', () => {
  for (const version of [98, 99]) {
    const { model, battle, owner, hero, pet } = arena('king', 1, version, false);
    owner.abilityUsed = true;
    hero.hp = 0;
    for (let i = 0; i < 260 && !battle.finished; i++) model.step(0.05);
    expect(pet.hp).toBeGreaterThan(0);
    expect(battle.finished).toBe(version < 99);
    if (version >= 99) expect(battle.elapsed).toBeCloseTo(13, 10);
  }
});

it.each(['king', 'warden'] as const)(
  'reproduces real %s ownership through portable reverse seeks',
  (kind) => {
    const r = nativeUnicornRecording(kind, kind === 'king' ? 1 : 15);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  },
);
