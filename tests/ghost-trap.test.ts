import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { nativeLayout } from '../src/game/native-campaign';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { GHOST_TRAP_READY, ghostTrapSource } from '../src/game/ghost-trap';
import { GHOST_TRAP_ART, ghostTrapFrame } from '../src/game/ghost-trap-art';
import { garrisonStats } from '../src/game/garrison-kinds';
import { garrisonDefenderTargetable } from '../src/game/garrison-abilities';
import { skeletonTrapArt } from '../src/game/skeleton-art';
import type { GarrisonDefender } from '../src/game/defenders';
import {
  lateTrapArena,
  liveNativeBattle,
  nativeReplay,
  nativeSetup,
  nearestDeploy,
} from './fixtures/late-trap-battle';

it('reads the pinned Ghost Trap row and its level-7 Royal Ghost', () => {
  expect(GHOST_TRAP_READY).toBe(true);
  expect(ghostTrapSource()).toEqual({
    trigger: 5,
    ground: true,
    air: false,
    minHousing: 1,
    character: 'Royal Ghost',
    kind: 'royalghost',
    level: 7,
    spawns: 1,
    firstSpawn: 0.6,
    interval: 0.15,
    actionFrame: 37,
    exports: {
      armed: 'troop_trap_land_lvl3_setup',
      triggered: 'troop_trap_land_lvl1',
      broken: 'troop_trap_land_lvl1_unarmed',
    },
  });
  expect(garrisonStats('royalghost', 7)).toMatchObject({
    hp: 300,
    dps: 720,
    rate: 1,
    range: 0.5,
    speed: 2,
  });
  expect(nativeLayout(75).filter((b) => b.npc === 'ghost-trap')).toHaveLength(12);
  expect(nativeLayout(77).filter((b) => b.npc === 'ghost-trap')).toHaveLength(6);
  // Original coffin frames: armed tier 3, trigger clip and broken coffin from tier 1.
  expect(GHOST_TRAP_ART.originX).toBe(skeletonTrapArt(3).originX);
  expect(ghostTrapFrame(undefined, 0, false)).toMatchObject({
    art: { texture: 'skeletontrap-native-3' },
    frame: 0,
  });
  expect(ghostTrapFrame(1, 1.5, false)).toMatchObject({
    art: { texture: 'skeletontrap-native-1' },
  });
  expect(ghostTrapFrame(1, 1.5, true)).toMatchObject({
    art: { texture: 'skeletontrap-native-1' },
    frame: 2,
  });
});

it('triggers on ground attackers within five tiles and releases a concealed Royal Ghost', () => {
  const trap = { ...makeBuilding(700, 'bomb', 20, 20), npc: 'ghost-trap' as const };
  const { m, b, unit } = lateTrapArena([trap]);
  const dragon = unit('dragon', 20.5, 22.5);
  const step = (n = 1) => {
    for (let i = 0; i < n; i++) m.step(0.05);
  };
  step(10);
  expect(b.traps[trap.id]).toBeUndefined();
  const giant = unit('giant', 20.5, 25.6);
  giant.hp = giant.maxHp = 1e6;
  giant.spawnedAt = 999;
  step(1);
  expect(b.traps[trap.id]).toBeUndefined();
  giant.spawnedAt = 0;
  giant.y = 25.45;
  step(1);
  const activatedAt = b.elapsed;
  expect(b.traps[trap.id]).toMatchObject({
    activatedAt,
    resolved: false,
    targetId: giant.id,
    spawned: 0,
  });
  expect(b.late!.ghostTrap!.traps[trap.id]).toEqual({ trapId: trap.id, activatedAt, spawned: [] });
  expect(m.visibleBuilding(trap)).toBe(true);
  step(12);
  const ghost = b.defenders!.find((d) => d.kind === 'royalghost') as GarrisonDefender;
  expect(ghost.spawnedAt).toBeCloseTo(activatedAt + 0.6, 9);
  // LogicTrap.SpawnUnit: 0.75 tiles at 59 degrees from the trap center, integer sine table.
  expect([ghost.push, ghost.sourceId]).toEqual([undefined, trap.id]);
  expect([ghost.x, ghost.y]).toEqual([20.5 + 197 / 512, 20.5 + 329 / 512]);
  expect(b.traps[trap.id]).toMatchObject({ resolved: true, spawned: 1 });
  expect(ghost.stealthUntil).toBeCloseTo(ghost.spawnedAt + 10, 9);
  expect(ghost.idleUntil).toBeCloseTo(ghost.spawnedAt + 0.21, 9);
  expect(garrisonDefenderTargetable(b, ghost)).toBe(false);
  const firstPosition = b.late!.ghostTrap!.traps[trap.id];
  expect(firstPosition.spawned).toEqual([ghost.id]);
  // Hold the Giant in place (as if sprung) so the concealed Ghost can reach it.
  giant.springUntil = 999;
  step(80);
  expect(ghost.attacks.length).toBeGreaterThan(0);
  expect(dragon.hp).toBe(dragon.maxHp);
  expect(giant.late?.garrison?.frost?.scale).toBe(0.5);
  expect(b.defenders!.filter((d) => d.kind === 'royalghost')).toHaveLength(1);
});

function ghostVillage(steps: number) {
  const setup = nativeSetup(75, { giant: 4, swordsman: 10, archer: 8 });
  const probe = new GameModel();
  probe.battle = liveNativeBattle(setup, []).battle;
  const traps = probe.battle!.buildings.filter((b) => b.npc === 'ghost-trap');
  const [x, y] = nearestDeploy(probe, traps[0].x + 0.5, traps[0].y + 0.5);
  const deployments = (['giant', 'swordsman', 'archer'] as const).flatMap((kind) =>
    Array.from({ length: setup.army[kind] }, () => [kind, x, y] as [typeof kind, number, number]),
  );
  return { setup, deployments, data: nativeReplay(setup, deployments, steps) };
}

it('reconstructs Go to Bat Ghost Trap releases across portable backward seeks', () => {
  const { setup, deployments, data } = ghostVillage(900);
  const live = liveNativeBattle(setup, deployments);
  const b = live.battle as Battle;
  const snapshots = new Map<number, string>();
  for (let s = 0; s < 900 && !b.finished; s++) {
    if ([20, 60, 150, 400].includes(s)) snapshots.set(s, JSON.stringify(b));
    live.step(0.05);
  }
  const ghosts = b.defenders!.filter((d) => d.kind === 'royalghost');
  expect(ghosts.length).toBeGreaterThan(0);
  expect(Object.keys(b.late!.ghostTrap!.traps).length).toBe(ghosts.length);
  expect(validateReplay(data)).toBe(true);
  expect(validateReplay({ ...data, version: 43 })).toBe(false);
  const record = parseReplayFile(JSON.stringify(makeReplayFile(data)));
  const viewer = new GameModel();
  expect(viewer.openReplay(record)).toBe(true);
  const seek = (at: number) => {
    viewer.seekReplay(at);
    while (viewer.replay!.seeking) viewer.step(0.05);
    return JSON.parse(JSON.stringify(viewer.battle));
  };
  for (const [s, snapshot] of [...snapshots].reverse()) {
    const at = data.steps.slice(0, s).reduce((a, v) => a + v, 0);
    expect(seek(at)).toEqual(JSON.parse(snapshot));
    seek(0);
    expect(seek(at)).toEqual(JSON.parse(snapshot));
  }
});
