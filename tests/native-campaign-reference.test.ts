import { expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../reference/campaign/', import.meta.url);
const read = (name: string) => fs.readFileSync(new URL(name, root), 'utf8');
const catalog = JSON.parse(read('catalog.json'));
const layouts = read('layouts.jsonl')
  .trim()
  .split('\n')
  .map((v) => JSON.parse(v));

it('keeps every native village and its source-verified opening, branches and bosses', () => {
  const goblin = catalog.stages.filter((s: any) => s.family === 'goblin');
  const challenges = catalog.stages.filter((s: any) => s.family === 'challenge');
  expect(goblin).toHaveLength(90);
  // Six Challenges are withheld: three for garrison defenders this game cannot field, three
  // for layouts drawn past the simulation grid.
  expect(challenges).toHaveLength(13);
  expect(Object.keys(catalog.withheld)).toHaveLength(6);
  expect(catalog.stages.map((s: any) => s.stage)).toEqual(
    Array.from({ length: 103 }, (_, i) => i + 1),
  );
  // The Challenge tail is ordered by the Town Hall its record name states.
  expect(challenges.map((s: any) => s.recommendedTownHall)).toEqual([
    ...challenges.map((s: any) => s.recommendedTownHall).sort((a: number, b: number) => a - b),
  ]);
  expect(challenges[0].name).toBe('Giant Smash');
  expect(challenges.at(-1).name).toBe('Bowling with Witches');
  expect(layouts.map((s) => s.stage)).toEqual(catalog.stages.map((s: any) => s.stage));
  expect(catalog.stages.slice(0, 4).map((s: any) => [s.name, s.gold, s.elixir])).toEqual([
    ['Payback', 500, 500],
    ['Goblin Forest', 500, 500],
    ['Goblin Outpost', 1500, 1500],
    ['Rocky Fort', 2500, 2500],
  ]);
  expect(catalog.stages[16].dependencies).toEqual([16, 13]);
  expect(catalog.stages[50].nativeRows[0].LevelFile).toBe('level/npc49.json');
  expect(catalog.stages[74].nativeRows[0].AllianceUnitType).toBe('Golden Dragon');
  expect(catalog.stages[89].nativeRows[0].AllianceUnitType).toBe('MOMMA');
  expect(layouts[0].buildings.map((b: any) => [b.data, b.lvl, b.x, b.y])).toEqual([
    [1000001, 0, 28, 18],
    [1000060, 0, 21, 22],
  ]);
  expect(layouts[1].buildings.find((b: any) => b.data === 1000018).units).toEqual([[4000006, 5]]);
  for (const village of layouts) {
    for (const b of [...village.buildings, ...village.traps])
      expect(catalog.entities[b.data]).toBeDefined();
  }
  for (const village of catalog.stages) {
    for (const dependency of village.dependencies) expect(dependency).toBeLessThan(village.stage);
  }
});

it('detects reference drift offline against the committed source manifest', () => {
  const provenance = JSON.parse(read('provenance.json'));
  expect(Object.keys(provenance.sources)).toHaveLength(110);
  for (const [file, sha] of Object.entries(provenance.outputs)) {
    expect(createHash('sha256').update(read(file)).digest('hex'), file).toBe(sha);
  }
});
