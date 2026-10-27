import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { nativeUnitStats } from '../src/game/native-units';
import { initialNativeState } from '../src/game/native-troops';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { prepareHealerTargets, stepHealer } from '../src/game/healing';
import { stepProjectiles } from '../src/game/projectiles';
import { healerHeroScalingRecording } from './fixtures/healer-hero-scaling';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

const ratios = [0.55, 0.55, 0.55, 0.55, 0.67, 0.78, 0.87, 0.9, 0.94, 0.98, 1.08];
function arena(level = 11, version = REPLAY_VERSION) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version));
  battle.troopLevels!.healer = level;
  let id = 1000;
  const unit = (kind: Unit['kind'], x: number) => {
    const stats = nativeUnitStats(kind, 1);
    const result: Unit = {
      id: id++,
      kind,
      x,
      y: 5,
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
  const hero = unit('barbarianking', 9);
  hero.hero = 'king';
  hero.hp = 100;
  const giant = unit('giant', 9);
  giant.hp = 100;
  const healer = unit('healer', 5);
  const cast = (caster = healer, casterLevel = level) => {
    prepareHealerTargets(battle);
    stepHealer(battle, caster, model.troopStats('healer', casterLevel), 0.05, () => {});
    return battle.projectiles!.at(-1)!;
  };
  const impact = () => {
    battle.elapsed = Math.max(...battle.projectiles!.map((p) => p.impact));
    stepProjectiles(
      battle,
      () => {},
      () => {},
    );
  };
  return { model, battle, hero, giant, healer, cast, impact, unit };
}

it.each(ratios.map((ratio, i) => [i + 1, ratio]))(
  'captures level %s Hero healing ratio %s while nearby troops receive full healing',
  (level, ratio) => {
    const { hero, giant, cast, impact } = arena(level);
    const shot = cast();
    expect(shot.healingHeroScale).toBe(ratio);
    const healing = nativeUnitStats('healer', level).heal;
    impact();
    expect(hero.hp - 100).toBeCloseTo(healing * ratio, 10);
    expect(giant.hp - 100).toBeCloseTo(healing, 10);
  },
);

it('keeps the level-eleven ratio after the source dies and the carried level changes', () => {
  const { battle, healer, hero, cast, impact } = arena();
  const shot = cast();
  healer.hp = 0;
  battle.units = battle.units.filter((u) => u.id !== healer.id);
  battle.troopLevels!.healer = 1;
  impact();
  expect(shot.healingHeroScale).toBe(1.08);
  expect(hero.hp - 100).toBeCloseTo(57.4 * 1.08, 10);
});

it("uses an equipment-spawned Healer's own level before the carried army level", () => {
  const { healer, hero, cast, impact } = arena(11);
  healer.level = 1;
  const shot = cast(healer, 1);
  expect(shot.healingHeroScale).toBe(0.55);
  impact();
  expect(hero.hp - 100).toBeCloseTo(25.2 * 0.55, 10);
});

it('keeps each casting tier through mixed-level Healer stacking', () => {
  const { unit, hero, giant, cast, impact } = arena();
  cast();
  const second = unit('healer', 5);
  second.level = 11;
  cast(second, 11);
  const third = unit('healer', 5);
  third.level = 1;
  cast(third, 1);
  impact();
  expect(hero.hp - 100).toBeCloseTo(57.4 * 1.08 * 2 + 25.2 * 0.55 * 0.9, 10);
  expect(giant.hp - 100).toBeCloseTo(57.4 * 2 + 25.2 * 0.9, 10);
});

it('caps healing at maximum HP and preserves historical version 97 packets and ratio', () => {
  const { hero, cast, impact } = arena();
  hero.hp = hero.maxHp - 1;
  cast();
  impact();
  expect(hero.hp).toBe(hero.maxHp);
  const old = arena(11, 97);
  expect(old.cast().healingHeroScale).toBeUndefined();
  old.impact();
  expect(old.hero.hp - 100).toBeCloseTo(57.4 * 0.55, 10);
});

it.each([5, 11])(
  'replays level %s Cannon wounds and actual Hero recovery through portable reverse seeks',
  (level) => {
    const r = healerHeroScalingRecording(level);
    expect(r.captured).toBe(ratios[level - 1]);
    const model = new GameModel();
    expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
    for (const snapshot of [...r.snapshots].reverse()) {
      model.seekReplay(snapshot.at);
      while (model.replay!.seeking) model.step(0.05);
      expect(JSON.parse(JSON.stringify(model.battle))).toEqual(snapshot.battle);
    }
  },
);
