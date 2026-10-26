import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type FX } from '../src/game/model';
import { emptyArmy } from '../src/game/army';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../src/game/replay';
import { nativeUnitStats } from '../src/game/native-units';
import {
  spawnNativeUnit,
  stepNativeUnit,
  stepNativeBattle,
  type NativeTroopContext,
} from '../src/game/native-troops';
import type { Defender } from '../src/game/defenders';

function arena(
  kind: 'electrodragon' | 'electromite' | 'superwizard' = 'electrodragon',
  version = REPLAY_VERSION,
) {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 1),
    makeBuilding(2, 'goldstorage', 7, 5, 15),
    makeBuilding(3, 'elixirstorage', 11, 5, 15),
    makeBuilding(4, 'goldstorage', 15, 5, 15),
    makeBuilding(5, 'elixirstorage', 19, 5, 15),
    makeBuilding(6, 'goldstorage', 23, 5, 15),
  ];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [];
  const battle = (model.battle = replayBattle(data.initial, version)),
    hits: { id: number; damage: number; at: number }[] = [],
    events: FX[] = [];
  const ctx: NativeTroopContext = {
    battle,
    buildings: battle.buildings,
    buildingsById: new Map(battle.buildings.map((b) => [b.id, b])),
    passableWalls: new Set(),
    nextId: () => model.state.nextId++,
    troopLevel: () => 1,
    damageBuilding: (b, damage, at) => {
      model.damage(b, damage, at);
      hits.push({ id: b.id, damage, at });
    },
    effect: (fx) => events.push(fx),
  };
  const unit = spawnNativeUnit(ctx, kind, 1, 5, 6.5, 0),
    stats = nativeUnitStats(kind, 1);
  const step = (at: number, factor = 1, actionRatio = 1) => {
    const dt = at - battle.elapsed;
    battle.elapsed = at;
    unit.cooldown -= dt;
    unit.pathAt -= dt;
    stepNativeUnit(ctx, unit, { ...stats, damage: stats.damage * factor }, dt, dt * actionRatio);
  };
  const pending = (at: number) => {
    battle.elapsed = at;
    stepNativeBattle(ctx);
  };
  const defender = (id: number, x: number, y: number, mode: 'ground' | 'air' = 'ground') => {
    const d = {
      kind: 'skeleton',
      id,
      x,
      y,
      mode,
      hp: 5000,
      maxHp: 5000,
      cooldown: 0,
      target: null,
      path: [],
      pathAt: 0,
      attacking: false,
      alerted: true,
      spawnedAt: 0,
    } as Defender;
    (battle.defenders ??= []).push(d);
    return d;
  };
  const root = (id: number, until = 20) =>
    ((battle.buildingEffects ??= {})[id] = { overgrownUntil: until });
  const cast = () => {
    step(0.05);
    if (kind === 'electrodragon') step(2.95);
    if (kind === 'electromite') step(0.55);
    return battle.elapsed;
  };
  const zaps = () =>
    kind === 'electrodragon'
      ? (battle.nativeElectroDragonZaps ?? [])
      : kind === 'electromite'
        ? (battle.nativeElectromiteZaps ?? [])
        : (battle.nativeSuperWizardZaps ?? []);
  return {
    model,
    battle,
    ctx,
    unit,
    stats,
    hits,
    events,
    step,
    pending,
    defender,
    root,
    cast,
    zaps,
  };
}
it.each(['electrodragon', 'electromite', 'superwizard'] as const)(
  '%s consumes a secondary hop on Overgrowth without damaging the rooted building',
  (kind) => {
    const a = arena(kind);
    a.root(3);
    const rootHp = a.battle.buildings[2].hp,
      lastHp = a.battle.buildings[3].hp,
      at = a.cast();
    a.pending(at + 1);
    const ids = a.zaps().map((z) => z.targetId);
    expect(ids).toContain(3);
    expect(a.battle.buildings[2].hp).toBe(rootHp);
    expect(ids.filter((id) => id === 3)).toHaveLength(1);
    if (kind === 'electrodragon' || kind === 'electromite') {
      expect(ids).toContain(4);
      expect(a.battle.buildings[3].hp).toBeCloseTo(
        lastHp - a.stats.damage * 0.8 ** 2 * (kind === 'electromite' ? 4 : 1),
        8,
      );
    } else expect(ids).toEqual([2, 3]);
  },
);
it.each(['electrodragon', 'electromite', 'superwizard'] as const)(
  'version 111 keeps %s skipping rooted secondary targets',
  (kind) => {
    const a = arena(kind, 111);
    a.root(3);
    const at = a.cast();
    a.pending(at + 1);
    expect(a.zaps().map((z) => z.targetId)).toEqual([2]);
  },
);
it('a rooted primary is still unavailable for direct acquisition', () => {
  const a = arena();
  a.root(2);
  a.step(0.05);
  expect(a.unit.native?.electroDragon?.charge?.target.id).not.toBe(2);
  expect(a.unit.target).not.toBe(2);
});
it('Overgrowth on a charging primary cancels its windup rather than preserving a collateral target', () => {
  const a = arena();
  a.step(0.05);
  expect(a.unit.native!.electroDragon!.charge!.target.id).toBe(2);
  a.root(2);
  a.step(1.05);
  expect(a.unit.native!.electroDragon!.charge?.target.id).not.toBe(2);
  expect(a.zaps()).toEqual([]);
});
it('a rooted branch uses one of Super Wizard’s nine secondary slots', () => {
  const a = arena('superwizard');
  a.battle.buildings[2].x = 9;
  a.root(3);
  const children = Array.from({ length: 9 }, (_, i) => a.defender(-1 - i, 11.4, 6.5));
  for (const d of children) d.alerted = false;
  const hp = a.battle.buildings[2].hp,
    at = a.cast();
  a.pending(at + 1);
  expect(a.zaps()).toHaveLength(10);
  expect(a.zaps().filter((z) => z.targetId === 3 && z.targetBuilding)).toHaveLength(1);
  expect(a.battle.buildings[2].hp).toBe(hp);
  expect(children.filter((d) => d.hp < 5000)).toHaveLength(8);
});
it.each([0.127, 0.129])(
  'a late update respects root expiry at the scheduled hop (%s seconds after cast)',
  (offset) => {
    const a = arena(),
      at = a.cast(),
      hp = a.battle.buildings[2].hp;
    a.root(3, at + offset);
    a.pending(at + 1);
    expect(a.zaps().map((z) => z.targetId)).toContain(3);
    expect(a.battle.buildings[2].hp).toBeCloseTo(
      hp - (offset < 0.128 ? a.stats.damage * 0.8 : 0),
      8,
    );
  },
);
it.each([
  [REPLAY_VERSION, 5.96966914442057],
  [111, 5.969669144420569],
])('version %s retains its committed chase arithmetic witness', (version, x) => {
  const a = arena('electrodragon', version),
    target = a.defender(-1, 7.4, 6.5);
  a.step(0.05);
  target.x = 9;
  target.y = 11.75;
  a.step(1.05);
  expect(a.unit.x).toBe(x);
  expect(a.unit.y).toBe(7.772690752051998);
});
