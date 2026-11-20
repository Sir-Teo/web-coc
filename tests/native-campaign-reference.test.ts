import { expect, it } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import obstacleCatalog from '../reference/obstacles/catalog.json';
import decorationCatalog from '../reference/decorations/catalog.json';
import { nativeSceneryArt } from '../src/game/campaign-scenery';
import { nativeScenery, NATIVE_SCENERY } from '../src/game/native-campaign';
import { BUILD_MIN } from '../src/game/grid';

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
  // All six withheld Challenges exceeded the legacy 48-cell board. Three also need defender
  // captures or behavior; the pinned readiness audit records the combined blockers.
  expect(challenges).toHaveLength(17);
  expect(Object.keys(catalog.withheld)).toHaveLength(2);
  expect(catalog.stages.map((s: any) => s.stage)).toEqual([
    ...Array.from({ length: 103 }, (_, i) => i + 1),
    151,
    152,
    153,
    154,
  ]);
  // The Challenge tail is ordered by the Town Hall its record name states.
  expect(challenges.slice(0, 13).map((s: any) => s.recommendedTownHall)).toEqual([
    ...challenges
      .slice(0, 13)
      .map((s: any) => s.recommendedTownHall)
      .sort((a: number, b: number) => a - b),
  ]);
  expect(challenges[0].name).toBe('Giant Smash');
  expect(challenges[12].name).toBe('Bowling with Witches');
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
  expect(Object.keys(provenance.sources)).toHaveLength(114);
  for (const [file, sha] of Object.entries(provenance.outputs)) {
    expect(createHash('sha256').update(read(file)).digest('hex'), file).toBe(sha);
  }
});

it('binds every Goblin Forest prop to its retained export without changing the layout', () => {
  const forest = layouts[1];
  expect(forest.buildings).toHaveLength(17);
  expect(forest.traps).toEqual([]);
  const source = [...forest.obstacles, ...forest.decos];
  expect(source).toHaveLength(13);
  expect(nativeScenery(1)).toEqual(
    source.map(({ data, x, y }: {data: number; x: number; y: number}) => ({ data, x: x + BUILD_MIN, y: y + BUILD_MIN })),
  );
  const portraits = [...obstacleCatalog.obstacles, ...decorationCatalog.decorations];
  for (const { data } of source) {
    const retained = portraits.find((p) => p.export === NATIVE_SCENERY[data].export);
    expect(retained?.size).toBe(NATIVE_SCENERY[data].size);
    expect(nativeSceneryArt(data)?.path).toBe(`/${retained?.art.path}`);
  }
});

it('uses a retained portrait only when the source export and footprint both match', () => {
  const portraits = [...obstacleCatalog.obstacles, ...decorationCatalog.decorations];
  let matched = 0;
  let placements = 0;
  for (const layout of layouts) {
    for (const { data } of [...layout.obstacles, ...layout.decos]) {
      const source = NATIVE_SCENERY[data];
      const retained = portraits.find((p) => p.export === source.export && p.size === source.size);
      expect(nativeSceneryArt(data)?.path, `stage ${layout.stage}, prop ${data}`).toBe(
        retained && `/${retained.art.path}`,
      );
      if (retained) matched++;
      placements++;
    }
  }
  expect({ matched, placements }).toEqual({ matched: 5498, placements: 6214 });
});
