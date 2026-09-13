import { expect, it } from 'vitest';
import native from '../reference/garrison/native.json';
import catalog from '../reference/garrison/catalog.json';
import campaign from '../reference/campaign/runtime.json';
import { nativeCampaignIssues } from '../src/game/native-campaign';

it('retains all ten campaign garrisons in source order without applying home housing caps', () => {
  expect(native.clientVersion).toBe('18.400.21');
  expect(Object.keys(native.sources)).toHaveLength(16);
  expect(Object.keys(native.fingerprintMembership)).toHaveLength(5);
  expect(catalog.garrisons.map((g) => g.stageIndex)).toEqual([
    56, 67, 69, 72, 73, 74, 76, 77, 83, 89,
  ]);
  for (const garrison of catalog.garrisons) {
    const stage = campaign.stages[garrison.stageIndex];
    expect(garrison.stage).toBe(stage.stage);
    expect(garrison.roster).toEqual(
      stage.allianceDefenders.map((row) => ({
        character: row.AllianceUnitType,
        sourceLevel: Number(row.AllianceUnitLevel),
        count: Number(row.AllianceUnitCount),
      })),
    );
    const raw = native.npcs[garrison.npc];
    expect(raw.filter((r) => r.AllianceUnitType)).toEqual(stage.allianceDefenders);
    expect(garrison.castles).toEqual(
      native.layoutCastles[garrison.source].map((b) => ({
        sourceId: b.id,
        globalId: b.data,
        level: b.lvl + 1,
        x: b.x,
        y: b.y,
      })),
    );
  }
  const noFlight = catalog.garrisons[0];
  expect(noFlight.roster).toEqual([
    { character: 'Dragon', sourceLevel: 7, count: 1 },
    { character: 'Balloon', sourceLevel: 8, count: 3 },
  ]);
  expect(noFlight.castles).toEqual([
    { sourceId: 500000102, globalId: 1000014, level: 5, x: 11, y: 18 },
  ]);
  const housing = noFlight.roster.reduce(
    (sum, r) =>
      sum + r.count * catalog.noFlightZone.find((u) => u.character === r.character)!.housing,
    0,
  );
  expect(housing).toBe(35);
  expect(catalog.castles['Clan Castle'][4].housing).toBe(30);
  expect(catalog.garrisons.filter((g) => g.castles.length === 0).map((g) => g.stage)).toEqual([
    74, 75,
  ]);
  expect(catalog.garrisons.at(-1)!.roster).toEqual([
    { character: 'MOMMA', sourceLevel: 1, count: 1 },
  ]);
});

it('keeps fifteen Castle tiers, original resource costs and troop, spell and siege capacities', () => {
  const rows = catalog.castles['Clan Castle'];
  expect(rows.map((r) => r.hp)).toEqual([
    600, 1200, 1800, 2600, 3000, 3400, 4000, 4400, 4800, 5200, 5400, 5600, 5800, 6000,
  ]);
  expect(rows.map((r) => r.housing)).toEqual([
    10, 15, 20, 25, 30, 35, 35, 40, 45, 45, 50, 50, 55, 55,
  ]);
  expect(rows.map((r) => r.spellHousing)).toEqual([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3, 3, 4]);
  expect(rows.map((r) => r.siegeHousing)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 2, 2, 2]);
  expect(rows.map((r) => r.townhall)).toEqual([3, 4, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  expect(rows.map((r) => r.seconds)).toEqual([
    0, 7200, 43200, 86400, 129600, 172800, 259200, 345600, 518400, 604800, 691200, 777600, 864000,
    1209600,
  ]);
  for (const [i, row] of rows.entries()) {
    expect(row).toMatchObject({ level: i + 1, globalId: 1000014, size: 3, resource: 'Elixir' });
    expect(row.cost).toBe(Number(native.buildings['Clan Castle'][i].BuildCost));
  }
  expect(catalog.castles['Goblin Castle']).toHaveLength(1);
  expect(catalog.castles['Goblin Castle'][0]).toMatchObject({
    globalId: 1000061,
    level: 1,
    hp: 4000,
    size: 3,
    housing: 50,
    resource: 'Gold',
    body: 'goblin_clancastle_01',
  });
});

it('retains exact above-home-cap Dragon and Balloon combat fields and death timing', () => {
  expect(catalog.noFlightZone).toEqual([
    {
      character: 'Dragon',
      sourceLevel: 7,
      visualLevel: 7,
      globalId: 4000008,
      housing: 20,
      hp: 3900,
      dps: 310,
      sourceSpeed: 200,
      attackRange: 250,
      intervalMs: 1250,
      damageRadius: 30,
      selfAsAoeCenter: false,
      flying: true,
      airTargets: true,
      groundTargets: true,
      newTargetAttackDelayMs: 0,
      deathDamage: 0,
      deathRadius: 0,
      deathDelayMs: 0,
      deathEffect: null,
      animation: 'Dragon7',
    },
    {
      character: 'Balloon',
      sourceLevel: 8,
      visualLevel: 8,
      globalId: 4000005,
      housing: 5,
      hp: 840,
      dps: 236,
      sourceSpeed: 130,
      attackRange: 0,
      intervalMs: 3000,
      damageRadius: 120,
      selfAsAoeCenter: true,
      flying: true,
      airTargets: false,
      groundTargets: true,
      newTargetAttackDelayMs: 2250,
      deathDamage: 268,
      deathRadius: 120,
      deathDelayMs: 416,
      deathEffect: 'Dark Balloon Exposion',
      animation: 'Balloon Goblin8',
    },
  ]);
  expect(native.characters.Dragon).toHaveLength(13);
  expect(native.characters.Balloon).toHaveLength(13);
  expect(native.characters['Super Minion'].map((r) => r.VisualLevel)).toEqual([
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    '10',
    '11',
    '12',
    '13',
    '14',
  ]);
  expect(native.characters['Super Minion'][0].DefensiveTroop).toBe('Defensive Super Minion');
  expect(native.characters).toHaveProperty('Defensive Super Minion');
});

it('preserves animation block schemas, source action frames and unresolved empty SWF fields', () => {
  const dragon = native.animations.Dragon7;
  const balloon = native.animations['Balloon Goblin8'];
  expect(dragon.columns).toEqual([
    'Name',
    'HasDirections',
    'ActionFrame',
    'ExportName',
    'Looping',
    'StopToLast',
    'SWF',
  ]);
  expect(dragon.rows.find((r) => r.Name === 'attack')).toMatchObject({
    ActionFrame: '2',
    HasDirections: 'TRUE',
    ExportName: 'dragon7_fly1',
    Looping: 'TRUE',
  });
  expect(dragon.rows.find((r) => r.Name === 'die')).toMatchObject({
    ExportName: 'barbarian_death_1',
    SWF: '',
    Looping: 'FALSE',
  });
  expect(balloon.rows.find((r) => r.Name === 'attack')).toMatchObject({
    ActionFrame: '34',
    HasDirections: 'FALSE',
    ExportName: 'balloon_lvl8_attack1',
    Looping: 'FALSE',
    SWF: 'sc/chr_balloon.sc',
  });
  expect(balloon.rows.find((r) => r.Name === 'die')).toMatchObject({
    ExportName: 'balloon_lvl8_die1',
    StopToLast: 'TRUE',
  });
  expect(native.globals.CLAN_CASTLE_RADIUS[0].NumberValue).toBe('13');
  expect(native.globals.BUNKER_SEARCH_TIME[0].NumberValue).toBe('320');
  expect(native.globals.CASTLE_DEFENDER_SEARCH_RADIUS[0].NumberValue).toBe('9');
  expect(native.globals.ENABLE_DEFENDING_ALLIANCE_TROOP_JUMP[0].BooleanValue).toBe('TRUE');
  expect(native.reconstruction.liveIntegration).toBe(false);
  expect(native.reconstruction.nativePlaybackVerified).toBe(false);
  expect(nativeCampaignIssues(56)).toContain('Garrison defenders');
});
