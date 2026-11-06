import { expect, it } from 'vitest';
import { GameModel, type Unit } from '../src/game/model';
import { hurtDefender, stepDefenders } from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonStats, garrisonTroopVersion } from '../src/game/garrison-kinds';
import { defaultSpellLevels } from '../src/game/army';
import { replayBattle, validateReplay, type ReplayData } from '../src/game/replay';
import { lateSetup } from './fixtures/late-defense-battle';

function fixture() {
  const m = new GameModel();
  m.startBattle(0, true);
  const b = m.battle!;
  b.buildings = [];
  b.defenders = [];
  b.units = [];
  return b;
}
function unit(id: number, kind: Unit['kind']): Unit {
  return {
    id,
    kind,
    x: 10,
    y: 10,
    hp: 5000,
    maxHp: 5000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  };
}
function advance(b: ReturnType<typeof fixture>, seconds: number) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++) {
    b.elapsed = Math.round((b.elapsed + 0.05) * 1e9) / 1e9;
    stepDefenders(b, 0.05, () => {});
  }
}
it('Balloon 5 uses its source 390 HP, 324 hit and delayed 108 ground-only death damage', () => {
  const b = fixture();
  const balloon = spawnGarrisonDefender(b, 'balloon', 5, 1, 10, 10, 0);
  b.units = [unit(1, 'giant'), unit(2, 'dragon')];
  expect(garrisonStats('balloon', 5)).toMatchObject({
    animation: 'Balloon Goblin3',
    hp: 390,
    damage: 324,
    deathDamage: 108,
    deathDelay: 0.416,
  });
  advance(b, 0.7);
  expect(balloon.attacks).toHaveLength(0);
  advance(b, 0.05);
  expect(b.units.map((u) => u.hp)).toEqual([4676, 5000]);
  hurtDefender(b, balloon, 390);
  advance(b, 0.4);
  expect(b.units[0].hp).toBe(4676);
  advance(b, 0.05);
  expect(b.units.map((u) => u.hp)).toEqual([4568, 5000]);
  advance(b, 1);
  expect(b.units[0].hp).toBe(4568);
});
it('Lava Hound 5 resolves the defensive row and spawns twelve Pups once', () => {
  const b = fixture();
  const hound = spawnGarrisonDefender(b, 'lavahound', 5, 1, 20, 20, 0);
  expect(garrisonStats('lavahound', 5)).toMatchObject({
    character: 'Defensive Lava Hound',
    animation: 'ADSeeker_lvl5',
    hp: 7600,
    damage: 36,
    deathDamage: 300,
    secondary: { character: 'Lava Pup', count: 12 },
  });
  expect(garrisonStats('lavahound', 6).secondary!.count).toBe(13);
  hurtDefender(b, hound, 7600);
  advance(b, 0.05);
  const pups = b.defenders!.filter((d) => d.kind === 'lavapup');
  expect(pups).toHaveLength(12);
  expect(new Set(pups.map((p) => p.id)).size).toBe(12);
  advance(b, 1);
  expect(b.defenders!.filter((d) => d.kind === 'lavapup')).toHaveLength(12);
});
it.each(['balloon', 'lavahound'] as const)('gates %s 5 recordings at version 234', (kind) => {
  const initial = lateSetup(56, { giant: 1 });
  initial.spellLevels = defaultSpellLevels();
  const castle = initial.buildings.find((b) => b.kind === 'clancastle')!;
  initial.garrisons = [
    { castleId: castle.id, mode: 'guard', troops: [{ kind, level: 5, count: 1 }] },
  ];
  const data: ReplayData = {
    version: 234,
    initial,
    steps: [],
    actions: [{ type: 'end', step: 0 }],
  };
  expect(garrisonTroopVersion(kind, 5)).toBe(234);
  expect(validateReplay(data)).toBe(true);
  expect(validateReplay({ ...data, version: 233 })).toBe(false);
  expect(replayBattle(initial, 234).garrisons).toBeDefined();
});
