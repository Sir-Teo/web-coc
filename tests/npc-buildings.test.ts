import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { GameModel, makeNpcBuilding } from '../src/game/model';
import { NPC_BUILDINGS, validNpcBuilding } from '../src/game/npc-buildings';
import { validateSave } from '../src/game/save';
import { REPLAY_VERSION, replayBattle, validateReplay, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

function recording(): ReplayData {
  const m = new GameModel();
  m.startBattle(0);
  m.deploy(1, 1);
  m.finishBattle();
  const replay = structuredClone(m.state.raidLog![0].replay!);
  replay.initial.buildings = [
    makeNpcBuilding(1000, 'goblin-townhall', 15, 15),
    makeNpcBuilding(1001, 'goblin-hut', 20, 20),
    makeNpcBuilding(1002, 'tutorial-cannon', 10, 10),
  ];
  replay.steps = Array(200).fill(0.05);
  replay.actions = [
    { step: 0, type: 'troop', kind: 'swordsman', x: 7, y: 11.5 },
    { step: 200, type: 'end' },
  ];
  return replay;
}

describe('native Goblin building identities', () => {
  it('uses native Town Hall levels and passive Hut stats without home-level scaling', () => {
    const source = JSON.parse(fs.readFileSync('reference/campaign/npc-buildings.json', 'utf8'));
    expect(NPC_BUILDINGS['goblin-townhall'].hp).toEqual(
      source['Town Hall'].map((r: any) => +r.Hitpoints),
    );
    expect(makeNpcBuilding(1, 'goblin-townhall', 10, 10, 1).maxHp).toBe(400);
    expect(makeNpcBuilding(1, 'goblin-townhall', 10, 10, 8).maxHp).toBe(3900);
    expect(makeNpcBuilding(2, 'goblin-hut', 20, 20)).toMatchObject({
      npc: 'goblin-hut',
      kind: 'builder',
      hp: 250,
      level: 1,
    });
    expect(source['Goblin Hut'][0].HousingSpace).toBeUndefined();
    expect(source['Goblin Hut'][0].DPS).toBeUndefined();
    expect(validNpcBuilding('goblin-hut', 'cannon', 1)).toBe(false);
    expect(() => makeNpcBuilding(1, 'goblin-hut', 1, 1, 2)).toThrow();
    expect(() => makeNpcBuilding(1, 'goblin-townhall', 1, 1, 9)).toThrow();
  });

  it('fires tutorial Cannon projectiles at 1.6 damage every 0.8 seconds, only at ground troops', () => {
    const m = new GameModel();
    m.battle = replayBattle(recording().initial);
    m.deploy(7, 11.5);
    // Keep the target in place to measure sustained defense fire without melee interference.
    const u = m.battle.units[0];
    const hp = u.hp;
    for (let i = 0; i < 64; i++) {
      u.x = 7;
      u.y = 11.5;
      u.path = [];
      u.pathAt = 1e9;
      m.step(0.05);
    }
    expect(hp - u.hp).toBeCloseTo(6.4);
    expect(m.battle.defenders ?? []).toEqual([]);
    expect(m.battle.buildings.find((b) => b.npc === 'goblin-hut')!.hp).toBe(250);

    const flying = new GameModel();
    flying.battle = replayBattle(recording().initial);
    flying.battle.remaining.balloon = 1;
    flying.activeTroop = 'balloon';
    flying.deploy(7, 11.5);
    for (let i = 0; i < 30; i++) flying.step(0.05);
    expect(flying.battle.units[0].hp).toBe(flying.battle.units[0].maxHp);
    expect(flying.battle.defenseTargets).toEqual({});
  });

  it('preserves all identities through shared replay export, seeking and restart', () => {
    const data = recording();
    expect(data.version).toBe(REPLAY_VERSION);
    expect(validateReplay(data)).toBe(true);
    const shared = parseReplayFile(JSON.stringify(makeReplayFile(data)));
    expect(shared.initial.buildings).toEqual(data.initial.buildings);
    const m = new GameModel();
    const home = structuredClone(m.state);
    expect(m.openReplay(shared)).toBe(true);
    m.seekReplay(1e6);
    for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
    const end = structuredClone(m.battle);
    expect(m.battle!.finished).toBe(true);
    m.seekReplay(0);
    for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.battle!.buildings).toEqual(data.initial.buildings);
    m.seekReplay(1e6);
    for (let i = 0; i < 100 && m.replay!.seeking; i++) m.step(0.05);
    expect(m.battle).toEqual(end);
    expect(m.state).toEqual(home);
  });

  it('rejects NPCs in home villages and practice, and mismatched or unknown identities', () => {
    const m = new GameModel();
    m.state.buildings[0].npc = 'goblin-townhall';
    expect(validateSave(m.state)).toBe(false);
    for (const mutate of [
      (r: ReplayData) => {
        r.initial.practice = true;
      },
      (r: ReplayData) => {
        r.initial.buildings[1].npc = 'tutorial-cannon';
      },
      (r: ReplayData) => {
        (r.initial.buildings[1] as any).npc = '__proto__';
      },
      (r: ReplayData) => {
        r.initial.buildings[1].level = 2;
      },
      (r: ReplayData) => {
        r.version = 25;
      },
    ]) {
      const r = recording();
      mutate(r);
      expect(validateReplay(r)).toBe(false);
    }
  });
});
