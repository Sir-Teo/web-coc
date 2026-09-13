import { expect, it } from 'vitest';
import catalog from '../reference/characters/catalog.json';
import { GameModel, makeBuilding, type Unit } from '../src/game/model';
import {
  stepAttackerVsDefenders,
  stepDefenders,
  type GarrisonDefender,
} from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import {
  garrisonAura,
  garrisonDeathSpell,
  garrisonSecondaryLevel,
  garrisonStats,
  garrisonStealth,
  garrisonSummonLevel,
  garrisonTroopVersion,
  isSpawnedGarrisonKind,
  splitTiming,
  GARRISON_KINDS,
  type GarrisonKind,
} from '../src/game/garrison-kinds';
import {
  pushFraction,
  sourceCos,
  sourceRandom,
  sourceSin,
  spawnAngle,
  spellRandomOffset,
} from '../src/game/garrison-abilities';
import { characterLevel } from '../src/game/character-catalog';
import { garrisonUnitScales } from '../src/game/garrison-status';
import {
  campaignGarrisonIssues,
  campaignGarrisonSetup,
  inertCampaignGarrison,
  resolvedCampaignGarrison,
} from '../src/game/garrison-campaign';
import { nativeLayout } from '../src/game/native-campaign';

function fixture() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  battle.units = [];
  battle.buildings = [];
  return battle;
}
type Battle = ReturnType<typeof fixture>;
const unit = (id: number, kind: Unit['kind'], x = 10, y = 10, extra: Partial<Unit> = {}): Unit => ({
  id,
  kind,
  x,
  y,
  hp: 50000,
  maxHp: 50000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  ...extra,
});
const step = (battle: Battle) => {
  battle.elapsed = Math.round((battle.elapsed + 0.05) * 1e9) / 1e9;
  stepDefenders(battle, 0.05, () => {});
};
const advance = (battle: Battle, seconds: number) => {
  for (let i = Math.round(seconds / 0.05); i > 0; i--) step(battle);
};
const untilAttacks = (battle: Battle, defender: GarrisonDefender, count: number, limit = 40) => {
  for (let i = 0; i < limit * 20 && (defender.attackCount ?? 0) < count; i++) step(battle);
  return battle.elapsed;
};
const kill = (battle: Battle, defender: GarrisonDefender) => {
  defender.hp = 0;
  defender.defeatedAt = battle.elapsed;
};
const LATE: [GarrisonKind, number][] = [
  ['electrodragon', 3],
  ['golem', 8],
  ['golemite', 8],
  ['witch', 4],
  ['summonedskeleton', 1],
  ['bowler', 4],
  ['lavahound', 6],
  ['lavapup', 1],
  ['electrotitan', 2],
  ['goldendragon', 1],
  ['momma', 1],
  ['royalghost', 7],
];

it('resolves every later family at its pinned source row and splits the attack timer', () => {
  const table = [
    [
      'electrodragon',
      'Electro Dragon',
      {
        hp: 4400,
        damage: 1120,
        rate: 3.5,
        range: 2.5,
        speed: 1.6,
        flying: true,
        airTargets: true,
        groundTargets: true,
        firstAttackDelay: 2.875,
        recovery: 0.625,
      },
    ],
    [
      'golem',
      'Golem',
      {
        hp: 7500,
        damage: 168,
        rate: 2.4,
        range: 1,
        speed: 1.5,
        deathDamage: 700,
        deathRadius: 1.5,
        firstAttackDelay: 1.5,
        recovery: 0.9,
      },
    ],
    [
      'golemite',
      'Golemite',
      {
        hp: 1440,
        damage: 42,
        rate: 3,
        range: 0.5,
        deathDamage: 140,
        deathRadius: 1.2,
        firstAttackDelay: 1.5,
        recovery: 1.5,
      },
    ],
    [
      'witch',
      'Witch',
      {
        hp: 470,
        damage: 115.5,
        rate: 0.7,
        range: 4,
        splash: 0.3,
        projectile: 'Witch_projectile',
        projectileSpeed: 5,
        projectileFixed: true,
        firstAttackDelay: 0.7,
        recovery: 0,
      },
    ],
    [
      'summonedskeleton',
      'Skeleton',
      { hp: 30, damage: 25, rate: 1, range: 0.4, speed: 3, spawnIdle: 0.5, airTargets: false },
    ],
    [
      'bowler',
      'Bowler',
      {
        hp: 470,
        damage: 211.2,
        rate: 2.2,
        range: 3,
        splash: 0.3,
        projectile: 'trollBoulder_lvl3',
        projectileSpeed: 4.75,
        airTargets: false,
        firstAttackDelay: 0.4,
        recovery: 0.7,
      },
    ],
    [
      'lavahound',
      'Defensive Lava Hound',
      {
        hp: 8000,
        damage: 40,
        rate: 2,
        range: 0.25,
        speed: 2.5,
        flying: true,
        airTargets: false,
        groundTargets: true,
        deathDamage: 350,
        deathRadius: 1.2,
        projectile: 'hound_projectile',
        projectileSpeed: 2,
        firstAttackDelay: 1.5,
        recovery: 0.5,
      },
    ],
    [
      'lavapup',
      'Lava Pup',
      {
        hp: 50,
        damage: 35,
        rate: 1,
        range: 2.25,
        speed: 4,
        flying: true,
        airTargets: true,
        groundTargets: true,
        projectile: 'tinyhound_projectile',
        projectileSpeed: 3,
        pushbackSpeed: 4,
      },
    ],
    [
      'electrotitan',
      'Electro Titan',
      {
        hp: 7700,
        damage: 300,
        rate: 1.5,
        range: 1.25,
        speed: 2,
        airTargets: true,
        groundTargets: true,
        firstAttackDelay: 1.5,
        recovery: 0,
      },
    ],
    [
      'goldendragon',
      'Golden Dragon',
      {
        hp: 32000,
        housing: 100,
        damage: 1750,
        rate: 1.25,
        range: 2.5,
        splash: 1,
        flying: true,
        firstAttackDelay: 1.25,
      },
    ],
    [
      'momma',
      'MOMMA',
      {
        hp: 50000,
        housing: 100,
        damage: 10000,
        rate: 5,
        range: 1.25,
        splash: 3,
        flying: false,
        airTargets: true,
        groundTargets: true,
        firstAttackDelay: 1.5,
        recovery: 3.5,
      },
    ],
    [
      'royalghost',
      'Royal Ghost',
      {
        hp: 300,
        damage: 720,
        rate: 1,
        range: 0.5,
        speed: 2,
        airTargets: false,
        firstAttackDelay: 1,
        recovery: 0,
        frost: { duration: 4, scale: 0.5 },
      },
    ],
  ] as const;
  for (const [kind, character, values] of table) {
    const level = Number(Object.keys(GARRISON_KINDS[kind].levels)[0]);
    expect(garrisonStats(kind, level), kind).toMatchObject({ character, split: true, ...values });
    expect(garrisonTroopVersion(kind, level)).toBe(44);
  }
  expect(LATE.map(([kind]) => isSpawnedGarrisonKind(kind))).toEqual([
    false,
    false,
    true,
    false,
    true,
    false,
    false,
    true,
    false,
    false,
    false,
    true,
  ]);
  expect(garrisonStats('electrodragon', 3).chain).toEqual({
    distance: 3,
    depth: 5,
    factor: 1,
    delay: 0.128,
    reduction: 0.2,
  });
  expect(garrisonStats('golem', 8).secondary).toEqual({
    character: 'Golemite',
    count: 3,
    distance: 1.5,
    offset: 0,
    randomize: false,
  });
  // The pinned defensive row releases 13 pups, not the offensive row's 18.
  expect(garrisonStats('lavahound', 6).secondary).toEqual({
    character: 'Lava Pup',
    count: 13,
    distance: 3.5,
    offset: 1,
    randomize: true,
  });
  expect(characterLevel('Lava Hound', 6)).toMatchObject({ SecondaryTroopCnt: '18' });
  expect(garrisonStats('witch', 4).summon).toEqual({
    character: 'Skeleton',
    count: 4,
    limit: 12,
    level: 1,
    time: 0.875,
    cooldown: 7,
    distance: 1.5,
  });
  expect(garrisonStats('bowler', 4).bounce).toEqual({ impacts: 2, spacing: 4 });
  expect(garrisonSecondaryLevel(garrisonStats('golem', 8))).toBe(8);
  expect(garrisonSecondaryLevel(garrisonStats('lavahound', 6))).toBe(1);
  expect(garrisonSummonLevel(garrisonStats('witch', 4))).toBe(1);
  expect(garrisonDeathSpell(garrisonStats('electrodragon', 3))).toEqual({
    spell: 'ElectroDragonDie',
    level: 6,
    damage: 85,
    radius: 2,
    hits: 6,
    firstHit: 1.9,
    interval: 0.4,
    randomRadius: 2.5,
    randomOnlyGfx: false,
    heroDamageScale: 1,
  });
  expect(garrisonAura(garrisonStats('electrotitan', 2))).toEqual({
    spell: 'Electro Titan Aura',
    level: 2,
    damage: 40,
    radius: 3.5,
    hits: 4000,
    firstHit: 0.4,
    interval: 0.4,
    randomRadius: 0,
    randomOnlyGfx: false,
    heroDamageScale: 0.25,
  });
  expect(garrisonStealth(garrisonStats('royalghost', 7))).toEqual({
    duration: 10,
    ignoreObstacles: true,
  });
  // Healing rows use the 200 ms windup threshold (Defending Builder: DPS -50 at 750 ms).
  expect(splitTiming(characterLevel('Defending Builder', 1)!)).toEqual({
    period: 0.75,
    recovery: 0.55,
    windup: 0.2,
    charge: 0,
    firstHit: 0.2,
  });
  // The earlier ten families keep their frozen interpretation and gain no later-family fields.
  for (const [kind, level] of [
    ['dragon', 7],
    ['balloon', 8],
    ['goblin', 7],
    ['archer', 9],
    ['dragon', 5],
    ['pekka', 8],
    ['valkyrie', 7],
    ['headhunter', 3],
    ['superminion', 9],
    ['babydragon', 6],
  ] as const)
    expect(garrisonStats(kind, level), kind).toMatchObject({
      split: false,
      recovery: 0,
      chain: undefined,
      secondary: undefined,
      summon: undefined,
      bounce: undefined,
      aura: undefined,
      frost: undefined,
      projectileFixed: false,
    });
  expect(catalog.absentGlobals).toEqual(['CHAINED_PROJECTILE_BOUNCE_COUNT']);
});

it('reproduces the source integer sine table, LogicRandom and spawn angles', () => {
  expect([0, 30, 59, 90, 149, 180, 270, 299, 360, -90].map(sourceSin)).toEqual([
    0, 512, 878, 1024, 527, 0, -1024, -896, 0, -1024,
  ]);
  expect(sourceCos(59)).toBe(527);
  const random = sourceRandom(1);
  const values = Array.from({ length: 13 }, () => random(1792));
  expect(values.every((v) => v >= 0 && v < 1792)).toBe(true);
  expect(Array.from({ length: 13 }, sourceRandom(1).bind(null, 1792))).toEqual(values);
  expect([0, 1, 2, 3].map((i) => spawnAngle({ id: -1 }, i, 4))).toEqual([59, 149, 239, 329]);
  expect(spawnAngle({ id: -7 }, 5, 13)).toBe(((59 * 7) % 360) + Math.trunc((360 * 5) / 13));
  // The first spell hit has no random offset; later offsets stay inside the square radius.
  expect(spellRandomOffset(12345, 0, 2.5)).toEqual({ x: 0, y: 0 });
  for (let k = 1; k < 6; k++) {
    const offset = spellRandomOffset(12345, k, 2.5);
    expect(Math.abs(offset.x)).toBeLessThan(2.5);
    expect(Math.abs(offset.y)).toBeLessThan(2.5);
    expect(spellRandomOffset(12345, k, 2.5)).toEqual(offset);
  }
});

it('Electro Dragons chain lightning through five attackers with delayed, reduced jumps', () => {
  const battle = fixture();
  const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 10, 10, 0);
  battle.units = [
    unit(1, 'giant', 12, 10),
    unit(2, 'giant', 14, 10),
    unit(3, 'dragon', 16.5, 10),
    unit(4, 'giant', 19, 10),
    unit(5, 'giant', 21.5, 10),
    unit(6, 'giant', 24, 10),
    unit(7, 'giant', 12, 13.2),
  ];
  // Split timer: 3,500 ms period = 625 ms recovery + 2,875 ms windup on a fresh target.
  const first = untilAttacks(battle, dragon, 1);
  expect(first).toBeCloseTo(2.9, 9);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([1120, 0, 0, 0, 0, 0, 0]);
  advance(battle, 0.6);
  const jumps = dragon.attacks[0].chain!;
  expect(jumps.map((j) => j.targetId)).toEqual([2, 3, 4, 5]);
  expect(jumps.map((j) => j.at)).toEqual(
    [2.9 + 0.128, 2.9 + 0.256, 2.9 + 0.384, 2.9 + 0.512].map((t) => expect.closeTo(t, 9)),
  );
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual(
    [1120, 896, 716.8, 573.44, 458.752, 0, 0].map((d) => expect.closeTo(d, 6)),
  );
  expect(dragon.chain).toBeUndefined();
  const second = untilAttacks(battle, dragon, 2);
  expect(second - first).toBeCloseTo(3.5, 9);
});

it('Electro Dragon death casts six deterministic ElectroDragonDie bolts on both layers', () => {
  const battle = fixture();
  const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 20, 20, 0);
  battle.units = [
    unit(1, 'giant', 20, 20),
    unit(2, 'dragon', 21, 20),
    unit(3, 'swordsman', 20, 21, { hero: 'king' }),
    unit(4, 'giant', 30, 30),
  ];
  dragon.stunnedUntil = 999;
  advance(battle, 1);
  kill(battle, dragon);
  step(battle);
  expect(dragon.bolts!.map((b) => b.at)).toEqual(
    [0, 1, 2, 3, 4, 5].map((k) => expect.closeTo(1 + 1.9 + 0.4 * k, 9)),
  );
  expect(dragon.bolts![0]).toMatchObject({ x: 20, y: 20 });
  advance(battle, 4.2);
  expect(dragon.bolts!.every((b) => b.done)).toBe(true);
  const expected = battle.units.map(
    (u) =>
      dragon.bolts!.filter((b) => Math.sqrt((u.x - b.x) ** 2 + (u.y - b.y) ** 2) <= 2).length * 85,
  );
  expect(expected[0]).toBeGreaterThanOrEqual(85);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual(expected);
  expect(expected[3]).toBe(0);
  const replay = fixture();
  const again = spawnGarrisonDefender(replay, 'electrodragon', 3, 1, 20, 20, 0);
  replay.units = [unit(1, 'giant', 20, 20)];
  again.stunnedUntil = 999;
  advance(replay, 1);
  kill(replay, again);
  step(replay);
  expect(again.bolts).toEqual(dragon.bolts!.map((b) => ({ ...b, done: false })));
});

it('Golems split into three pushed Golemites after their ground death damage', () => {
  const battle = fixture();
  const golem = spawnGarrisonDefender(battle, 'golem', 8, 1, 20.5, 20.5, 0);
  battle.units = [
    unit(1, 'giant', 21.5, 20.5),
    unit(2, 'dragon', 20.5, 21),
    unit(3, 'giant', 23, 20.5),
  ];
  golem.stunnedUntil = 999;
  advance(battle, 0.5);
  kill(battle, golem);
  step(battle);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([700, 0, 0]);
  const golemites = battle.defenders!.filter((d) => d.kind === 'golemite') as GarrisonDefender[];
  expect(golemites.map((d) => [d.level, d.parentId, d.spawnedAt])).toEqual([
    [8, golem.id, 0.5],
    [8, golem.id, 0.5],
    [8, golem.id, 0.5],
  ]);
  // Angles 59, 179 and 299 degrees; 1.5 tiles (768 units) over 2 * 768 / 3 = 512 ms.
  const vector = (angle: number) => [
    Math.trunc((768 * sourceCos(angle)) / 1024) / 512,
    Math.trunc((768 * sourceSin(angle)) / 1024) / 512,
  ];
  expect(golemites.map((d) => [d.push!.toX - 20.5, d.push!.toY - 20.5])).toEqual(
    [59, 179, 299].map(vector),
  );
  expect(golemites.every((d) => d.push!.duration === 0.512)).toBe(true);
  // Eased push-out (fast start): positions follow pushFraction until the push ends.
  advance(battle, 0.45);
  for (const d of golemites) {
    const f = pushFraction(d.push!, battle.elapsed);
    expect(f).toBeCloseTo(1 - (1 - (battle.elapsed - 0.5) / 0.512) ** 2, 9);
    expect([d.x, d.y]).toEqual([
      d.push!.fromX + (d.push!.toX - d.push!.fromX) * f,
      d.push!.fromY + (d.push!.toY - d.push!.fromY) * f,
    ]);
  }
  expect(golemites.every((d) => d.attacks.length === 0)).toBe(true);
  advance(battle, 0.15);
  // A Golemite dies with its own 140-damage splash.
  kill(battle, golemites[0]);
  const before = battle.units.map((u) => u.hp);
  step(battle);
  const near = battle.units.map((u, i) =>
    Math.hypot(u.x - golemites[0].x, u.y - golemites[0].y) <= 1.2 && u.kind !== 'dragon'
      ? before[i] - 140
      : u.hp,
  );
  expect(battle.units.map((u) => u.hp).slice(0, 1)).toEqual(near.slice(0, 1));
  // A push stops at a building: ground spawns keep their last passable position.
  const blocked = fixture();
  blocked.buildings = [makeBuilding(900, 'goldstorage', 20, 21, 1)];
  const other = spawnGarrisonDefender(blocked, 'golem', 8, 1, 20.5, 20.5, 0);
  kill(blocked, other);
  step(blocked);
  const pushed = blocked.defenders!.find((d) => d.kind === 'golemite')! as GarrisonDefender;
  expect(pushed.push!.limit).toBeLessThan(1);
});

it('Witches summon Skeleton waves on the source cycle, capped by SummonLimit', () => {
  const battle = fixture();
  const witch = spawnGarrisonDefender(battle, 'witch', 4, 1, 10, 10, 0);
  battle.units = [unit(1, 'giant', 13, 10, { hp: 1e7, maxHp: 1e7 })];
  const wave = () =>
    battle.defenders!.filter((d) => d.kind === 'summonedskeleton') as GarrisonDefender[];
  // Timer starts at 7,000 / 4 ms; the window opens below SummonTime (875 ms).
  advance(battle, 0.85);
  expect(wave()).toHaveLength(0);
  step(battle);
  expect(battle.elapsed).toBeCloseTo(0.9, 9);
  expect(wave().map((d) => [d.level, d.spawnedAt, d.push!.duration, d.idleUntil])).toEqual(
    Array(4).fill([1, 0.9, 0.512, expect.closeTo(0.9 + 0.512 + 0.5, 9)]),
  );
  expect(witch.summon!.delayUntil).toBeCloseTo(0.9 + 7 / 6, 9);
  // The Witch's first bolt came at 0.7 s; the summon delay then holds her attacks.
  const attacks = witch.attackCount;
  expect(attacks).toBe(1);
  // Spawning Skeletons cannot be selected; the alerted Witch can.
  const archer = unit(2, 'archer', 10.2, 11.2);
  for (const s of wave()) s.alerted = true;
  const retaliate = () =>
    stepAttackerVsDefenders(
      battle,
      archer,
      { damage: 1, speed: 3, range: 3.5, rate: 1 },
      0.05,
      [],
      () => {},
      () => {},
    );
  expect(retaliate()).toBe(true);
  expect(archer.defenderTarget).toBe(witch.id);
  witch.alerted = false;
  delete archer.defenderTarget;
  expect(retaliate()).toBe(false);
  advance(battle, 1.1);
  expect(witch.attackCount).toBe(attacks);
  expect(battle.elapsed).toBeGreaterThan(0.9 + 0.512 + 0.5);
  expect(retaliate()).toBe(true);
  expect(wave().map((d) => d.id)).toContain(archer.defenderTarget);
  // The next wave comes one full cooldown cycle later; three waves reach the limit of twelve.
  battle.units[0].x = 30; // out of reach so the Skeletons live
  for (const s of wave()) s.stunnedUntil = 999;
  expect(battle.elapsed).toBeCloseTo(2, 9);
  advance(battle, 5.85);
  expect(wave()).toHaveLength(4);
  step(battle);
  expect(battle.elapsed).toBeCloseTo(7.9, 9);
  expect(wave()).toHaveLength(8);
  for (const s of wave()) s.stunnedUntil = 999;
  advance(battle, 7);
  expect(wave()).toHaveLength(12);
  for (const s of wave()) s.stunnedUntil = 999;
  advance(battle, 14);
  expect(wave()).toHaveLength(12);
  expect(witch.summon!.events.map((e) => e.count)).toEqual([4, 4, 4]);
  // Summons still being pushed out die with the Witch.
  const second = fixture();
  const other = spawnGarrisonDefender(second, 'witch', 4, 1, 10, 10, 0);
  second.units = [unit(1, 'giant', 13, 10)];
  advance(second, 0.95);
  kill(second, other);
  step(second);
  expect(
    second.defenders!.filter((d) => d.kind === 'summonedskeleton').every((d) => d.hp === 0),
  ).toBe(true);
});

it('Bowler boulders strike the target, then bounce four tiles further along the throw', () => {
  const battle = fixture();
  const bowler = spawnGarrisonDefender(battle, 'bowler', 4, 1, 10, 10, 0);
  battle.units = [
    unit(1, 'giant', 13, 10),
    unit(2, 'giant', 13.25, 10),
    unit(3, 'giant', 17, 10),
    unit(4, 'dragon', 17, 10),
  ];
  const thrown = untilAttacks(battle, bowler, 1);
  // NewTargetAttackDelay 1,100 of 2,200 ms with 700 ms recovery: first throw 400 ms after engaging.
  expect(thrown).toBeCloseTo(0.4, 9);
  advance(battle, 0.7);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual(
    [211.2, 211.2, 0, 0].map((d) => expect.closeTo(d, 9)),
  );
  expect(bowler.attacks[0].hitAt! - thrown).toBeCloseTo(3 / 4.75, 6);
  advance(battle, 0.9);
  expect(bowler.attacks[0]).toMatchObject({ bounceX: 17, bounceY: 10 });
  expect(bowler.attacks[0].bounceAt! - bowler.attacks[0].hitAt!).toBeCloseTo(4 / 4.75, 6);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual(
    [211.2, 211.2, 211.2, 0].map((d) => expect.closeTo(d, 9)),
  );
  expect(bowler.shots).toEqual([]);
});

it('Lava Hounds attack ground only and burst into thirteen randomized Lava Pups', () => {
  const battle = fixture();
  const hound = spawnGarrisonDefender(battle, 'lavahound', 6, 1, 20, 20, 0);
  battle.units = [unit(1, 'dragon', 20.5, 20), unit(2, 'giant', 23, 20)];
  untilAttacks(battle, hound, 1);
  expect(hound.target).toBe(2);
  expect(hound.mode).toBe('air');
  // Split families stay in range up to AttackRange + 0.5 tiles: the Hound fires from 0.75 tiles.
  expect(Math.hypot(23 - hound.x, 20 - hound.y)).toBeCloseTo(0.75, 9);
  advance(battle, 0.5);
  expect(hound.attacks[0]).toMatchObject({ projectile: 'hound_projectile', hit: true });
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([0, 40]);
  kill(battle, hound);
  step(battle);
  // Ground-only death splash within 1.2 tiles: the hovering Hound is over the Giant.
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([0, 390]);
  const pups = battle.defenders!.filter((d) => d.kind === 'lavapup') as GarrisonDefender[];
  expect(pups).toHaveLength(13);
  const random = sourceRandom(-hound.id);
  pups.forEach((pup, i) => {
    const angle = spawnAngle(hound, i, 13);
    expect(pup.push!.fromX - hound.x).toBeCloseTo(
      Math.trunc((512 * sourceCos(angle)) / 1024) / 512,
      9,
    );
    const units = random(1792) + 896;
    expect(pup.push!.toX - pup.push!.fromX).toBeCloseTo(
      Math.trunc((units * sourceCos(angle)) / 1024) / 512,
      9,
    );
    expect(pup.push!.duration).toBe(Math.trunc((2 * units) / 12) / 1000);
    expect(units / 512).toBeGreaterThanOrEqual(1.75);
    expect(units / 512).toBeLessThan(5.25);
  });
  advance(battle, 3);
  // Pups fly and strike air as well as ground attackers.
  expect(pups.some((p) => p.attacks.some((a) => a.targetId === 1))).toBe(true);
});

it('Electro Titans pulse their aura every 400 ms on both layers, even while stunned', () => {
  const battle = fixture();
  const titan = spawnGarrisonDefender(battle, 'electrotitan', 2, 1, 10, 10, 0);
  titan.stunnedUntil = 999;
  battle.units = [
    unit(1, 'giant', 12, 10),
    unit(2, 'dragon', 10, 13.4),
    unit(3, 'giant', 14, 10),
    unit(4, 'swordsman', 10, 8, { hero: 'king' }),
  ];
  advance(battle, 2);
  expect(titan.auraHits).toBe(5);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([200, 200, 0, 50]);
  kill(battle, titan);
  advance(battle, 1);
  expect(titan.auraHits).toBe(5);
});

it('Golden Dragons and M.O.M.M.A splash only the struck layer', () => {
  const battle = fixture();
  const golden = spawnGarrisonDefender(battle, 'goldendragon', 1, 1, 10, 10, 0);
  battle.units = [
    unit(1, 'giant', 12, 10),
    unit(2, 'giant', 12.9, 10),
    unit(3, 'dragon', 12, 10.5),
    unit(4, 'giant', 13.2, 10),
  ];
  expect(untilAttacks(battle, golden, 1)).toBeCloseTo(1.25, 9);
  expect(battle.units.map((u) => 50000 - u.hp)).toEqual([1750, 1750, 0, 0]);
  const second = fixture();
  const momma = spawnGarrisonDefender(second, 'momma', 1, 1, 10, 10, 0);
  second.units = [
    unit(1, 'giant', 11, 10),
    unit(2, 'giant', 13.5, 10),
    unit(3, 'giant', 14.5, 10),
    unit(4, 'dragon', 11, 10.2),
  ];
  expect(untilAttacks(second, momma, 1)).toBeCloseTo(1.5, 9);
  expect(second.units.map((u) => 50000 - u.hp)).toEqual([10000, 10000, 0, 0]);
  expect(untilAttacks(second, momma, 2) - 1.5).toBeCloseTo(5, 9);
});

it('Royal Ghosts stay concealed for ten seconds, ignore obstacles and slow their targets', () => {
  const battle = fixture();
  battle.buildings = [makeBuilding(900, 'goldstorage', 12, 9, 1)];
  const ghost = spawnGarrisonDefender(battle, 'royalghost', 7, 1, 10.5, 10.5, 0);
  expect(ghost.stealthUntil).toBe(10);
  battle.units = [unit(1, 'giant', 17.5, 10.5)];
  const archer = unit(2, 'archer', 9, 10.5);
  advance(battle, 1.5);
  // Walking straight through the storage footprint (12..15) instead of around it.
  expect(ghost.y).toBeCloseTo(10.5, 9);
  expect(ghost.x).toBeGreaterThan(12.5);
  const attackAt = untilAttacks(battle, ghost, 1);
  expect(battle.units[0].hp).toBe(50000 - 720);
  expect(battle.units[0].late?.garrison?.frost).toMatchObject({ until: attackAt + 4, scale: 0.5 });
  expect(garrisonUnitScales(battle, battle.units[0])).toEqual({ move: 0.5, attack: 0.5 });
  ghost.alerted = true;
  archer.x = ghost.x - 2;
  archer.y = ghost.y;
  const retaliate = () =>
    stepAttackerVsDefenders(
      battle,
      archer,
      { damage: 1, speed: 3, range: 3.5, rate: 1 },
      0.05,
      [],
      () => {},
      () => {},
    );
  expect(retaliate()).toBe(false);
  battle.units[0].hp = 1e9;
  advance(battle, 10 - battle.elapsed);
  expect(retaliate()).toBe(true);
});

it('keeps later-family combat, spawns and summons deterministic through JSON restoration', () => {
  const battle = fixture();
  for (const [index, [kind, level]] of LATE.entries())
    spawnGarrisonDefender(
      battle,
      kind,
      level,
      1,
      6 + (index % 6) * 2,
      6 + Math.floor(index / 6) * 3,
      0,
    );
  battle.units = [
    unit(1, 'giant', 10, 12, { hp: 20000, maxHp: 20000 }),
    unit(2, 'dragon', 12, 12, { hp: 6000, maxHp: 6000 }),
    unit(3, 'swordsman', 9, 13, { hero: 'king', hp: 9000, maxHp: 9000 }),
    unit(4, 'archer', 14, 8, { hp: 3000, maxHp: 3000 }),
  ];
  advance(battle, 4);
  for (const defender of battle.defenders!)
    if (
      defender.kind === 'golem' ||
      defender.kind === 'lavahound' ||
      defender.kind === 'electrodragon'
    )
      kill(battle, defender as GarrisonDefender);
  advance(battle, 0.5);
  const restored = JSON.parse(JSON.stringify(battle));
  advance(battle, 8);
  advance(restored, 8);
  expect(restored).toEqual(battle);
  expect(battle.defenders!.some((d) => d.kind === 'golemite')).toBe(true);
  expect(battle.defenders!.some((d) => d.kind === 'lavapup')).toBe(true);
  expect(battle.defenders!.some((d) => d.kind === 'summonedskeleton')).toBe(true);
});

it('keeps the bunkerless Besieged roster recorded and verifiably inert', () => {
  expect(inertCampaignGarrison(73)).toEqual({
    reason: 'No source bunker',
    members: [expect.objectContaining({ character: 'Electro Dragon', sourceLevel: 3, count: 3 })],
  });
  expect(campaignGarrisonIssues(73)).toEqual([]);
  expect(resolvedCampaignGarrison(73)).toEqual({
    castle: null,
    troops: [{ kind: 'electrodragon', level: 3, count: 3 }],
  });
  const layout = nativeLayout(73);
  expect(layout.some((b) => b.kind === 'clancastle' || b.npc === 'foreboding-cave')).toBe(false);
  expect(campaignGarrisonSetup(73, layout)).toBeUndefined();
  for (const index of [56, 67, 69, 72, 74, 76, 77, 83, 89])
    expect(inertCampaignGarrison(index)).toBeUndefined();
});
