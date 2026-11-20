import { describe, expect, it } from 'vitest';
import { GameModel, makeBuilding, type Building } from '../src/game/model';
import { BUILDER_MENU_TEXTS, SUGGESTED, builderMenu } from '../src/game/builder-menu';
import { BUILDINGS } from '../src/game/data';

/** The starter village at Town Hall 5 with plenty of gold and no elixir. */
function village() {
  const m = new GameModel();
  m.townhall!.level = 5;
  m.state.gold = 1_000_000;
  m.state.elixir = 0;
  return m;
}

describe('builder menu', () => {
  it('uses the client’s headings', () => {
    expect(BUILDER_MENU_TEXTS).toMatchObject({
      inProgress: 'Upgrades in progress:',
      suggested: 'Suggested upgrades:',
      other: 'Other upgrades:',
    });
  });

  it('lists builder jobs soonest first, excluding villager work', () => {
    const m = village();
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    m.upgrade(cannon.id);
    const mine = m.state.buildings.find((b) => b.kind === 'goldmine')!;
    mine.upgradeEnd = m.clock + 1000;
    const tree = m.obstacles[0];
    m.state.elixir = 100_000;
    m.removeObstacle(tree.id);
    const { jobs } = builderMenu(m);
    expect(jobs.map((j) => j.id)).toEqual([mine.id, cannon.id]);
    expect(jobs[1]).toMatchObject({ name: 'Cannon', detail: `Level ${cannon.level + 1}` });
  });

  const specialJobs: [Building['kind'], Partial<Building>, string][] = [
    ['cannon', { level: 7, improving: 'gearup' }, 'Gear Up'],
    ['townhall', { level: 17, improving: 'weapon', weaponLevel: 3 }, 'Weapon level 4'],
    ['townhall', { level: 18, improving: 'guardian', guardianLevel: 2 }, 'Guardian level 3'],
    ['cannon', { level: 21, improving: 'supercharge', supercharge: 1 }, 'Supercharge 2'],
    [
      'craftingstation',
      { improving: 'module', moduleUpgrade: { kind: 'candle', module: 1 } },
      'Damage level 2',
    ],
  ];
  it.each(specialJobs)('labels the timed %s job %j as %s', (kind, fields, detail) => {
    const m = village();
    const b = m.state.buildings.find((row) => row.kind === kind) ?? makeBuilding(999, kind, 30, 30);
    if (!m.state.buildings.includes(b)) m.state.buildings.push(b);
    Object.assign(b, fields, { upgradeEnd: m.clock + 1000 });
    expect(builderMenu(m).jobs).toEqual([
      { id: b.id, name: BUILDINGS[kind].name, detail, end: b.upgradeEnd },
    ]);
  });

  it('suggests the cheapest affordable upgrades and groups buildings of a kind and level', () => {
    const m = village();
    for (const b of m.state.buildings) if (b.kind === 'cannon') b.level = 2;
    const { suggested, other } = builderMenu(m);
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.length).toBeLessThanOrEqual(SUGGESTED);
    expect(suggested.every((o) => o.affordable)).toBe(true);
    for (let i = 1; i < suggested.length; i++)
      expect(suggested[i].cost).toBeGreaterThanOrEqual(suggested[i - 1].cost);
    // Elixir upgrades with no elixir wait among the others, priced as they are.
    const camp = [...suggested, ...other].find((o) => o.kind === 'camp' && o.level > 0)!;
    expect(camp.affordable).toBe(false);
    expect(other).toContain(camp);
    // Both Cannons share a level and a row.
    const cannons = m.state.buildings.filter((b) => b.kind === 'cannon');
    const row = [...suggested, ...other].find((o) => o.kind === 'cannon' && o.level > 0)!;
    expect([...row.ids].sort((a, b) => a - b)).toEqual(
      cannons.map((b) => b.id).sort((a, b) => a - b),
    );
    // A new building the Town Hall allows appears once, priced from the Shop.
    const fresh = [...suggested, ...other].filter((o) => o.kind === 'cannon' && o.level === 0);
    expect(fresh).toHaveLength(1);
    expect(fresh[0].ids).toEqual([]);
    // Walls and traps need no builder and stay out, as in the original.
    expect([...suggested, ...other].some((o) => o.kind === 'wall' || o.kind === 'bomb')).toBe(
      false,
    );
  });

  it('leaves out buildings at their Town Hall’s ceiling or already upgrading', () => {
    const m = village();
    const th = m.townhall!;
    th.level = BUILDINGS.townhall.maxLevel;
    const cannon = m.state.buildings.find((b) => b.kind === 'cannon')!;
    m.upgrade(cannon.id);
    const options = [...builderMenu(m).suggested, ...builderMenu(m).other];
    expect(options.some((o) => o.kind === 'townhall')).toBe(false);
    expect(options.some((o) => o.ids.includes(cannon.id))).toBe(false);
  });
});

it('keeps each upgrading hero’s identity in the builder job list', () => {
  const m = village();
  m.state.heroes = {
    warden: { level: 5, upgradeStart: m.clock, upgradeEnd: m.clock + 2000 },
    queen: { level: 2, upgradeStart: m.clock, upgradeEnd: m.clock + 1000 },
  };
  expect(builderMenu(m).jobs).toEqual([
    { hero: 'queen', name: 'Archer Queen', detail: 'Level 3', end: m.clock + 1000 },
    { hero: 'warden', name: 'Grand Warden', detail: 'Level 6', end: m.clock + 2000 },
  ]);
});
