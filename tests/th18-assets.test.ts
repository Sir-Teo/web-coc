import unitArt from '../reference/full-client/unit-art.json';
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import {
  BUILDINGS,
  TROOP_KEYS,
  asset,
  maxLevelFor,
  maxTroopLevel,
  researchLaboratory,
} from '../src/game/data';
import { GameModel, makeBuilding } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { emptyArmy } from '../src/game/army';
import { validateReplay } from '../src/game/replay';
import { nativeScenePoses, type NativeMeshGraph } from '../src/game/native-mesh';
import buildingArt from '../reference/full-client/village-art.json';
import troopArt from '../reference/full-client/troop-art.json';
import progression from '../reference/full-client/progression.json';

it('offers level-specific artwork and upgrade ceilings throughout TH8–18', () => {
  for (let th = 8; th <= 18; th++)
    for (const kind of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]) {
      const level = maxLevelFor(kind, th);
      if (!level) continue;
      expect(fs.existsSync('public' + asset(kind, level)), `${kind} TH${th} level ${level}`).toBe(
        true,
      );
      expect(level).toBeLessThanOrEqual(BUILDINGS[kind].maxLevel);
    }
  expect(maxLevelFor('townhall', 18)).toBe(18);
  expect(maxLevelFor('wall', 18)).toBe(19);
  expect(maxLevelFor('revengetower', 17)).toBe(0);
  expect(maxLevelFor('revengetower', 18)).toBe(2);
});

it('retains TH18 progression, dark training, research and new-army replay data across reload', () => {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 5, 5, 18),
    makeBuilding(2, 'darkbarracks', 12, 5, 13),
    makeBuilding(3, 'laboratory', 18, 5, 16),
    makeBuilding(4, 'camp', 24, 5, 14),
    makeBuilding(5, 'builder', 31, 5, 1),
  ];
  model.state.nextId = 1000;
  model.state.army = emptyArmy();
  model.state.dark = 9999999;
  model.train('ruinwitch');
  expect(model.state.army.ruinwitch).toBe(1);
  const before = model.state.dark;
  model.researchTroop('ruinwitch');
  expect(model.state.research?.kind).toBe('ruinwitch');
  expect(model.state.dark).toBeLessThan(before);
  const restored = new GameModel(JSON.parse(JSON.stringify(model.state)));
  expect(validateSave(restored.state)).toBe(true);
  expect(restored.state.research).toEqual(model.state.research);
  restored.tick(restored.state.research!.end + 1);
  expect(restored.troopLevel('ruinwitch')).toBe(2);
  restored.startBattle(0, true);
  restored.activeTroop = 'ruinwitch';
  expect(restored.deploy(1, 45)).toBe(true);
  restored.finishBattle();
  expect(validateReplay(restored.state.raidLog![0].replay)).toBe(true);
  expect(researchLaboratory('swordsman', 5)).toBe(7);
  expect(maxTroopLevel('swordsman')).toBe(13);
});

function verifyGraph(graph: NativeMeshGraph) {
  for (const texture of Object.values(graph.textures))
    expect(fs.existsSync('public/' + texture.path), texture.path).toBe(true);
  for (const name of Object.keys(graph.exports)) {
    for (const time of [0, 0.5]) expect(() => nativeScenePoses(graph, name, time)).not.toThrow();
  }
}
describe('complete extracted native animation packs', () => {
  for (const [kind, row] of Object.entries(buildingArt.buildings))
    it(`${kind}: every building tier and declared state resolves`, () => {
      const bytes = fs.readFileSync('public/' + row.path);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
      const pack = JSON.parse(bytes.toString());
      expect(pack.levels.length).toBe(
        progression.buildings[kind as keyof typeof progression.buildings].levels.length,
      );
      for (const graph of Object.values(pack.scenes)) verifyGraph(graph as NativeMeshGraph);
    });
  for (const kind of TROOP_KEYS)
    it(`${kind}: every troop tier has usable source walk and attack timelines`, () => {
      const row = { ...troopArt.troops, ...unitArt.units }[kind];
      const bytes = fs.readFileSync('public/' + row.path);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(row.sha256);
      const pack = JSON.parse(bytes.toString());
      expect(pack.levels.length).toBe(maxTroopLevel(kind));
      for (const level of pack.levels) {
        expect((level.states.walk ?? level.states.idle).exports.length).toBeGreaterThan(0);
        expect(level.states.attack.exports.length).toBeGreaterThan(0);
      }
      for (const graph of Object.values(pack.scenes)) verifyGraph(graph as NativeMeshGraph);
    });
});
