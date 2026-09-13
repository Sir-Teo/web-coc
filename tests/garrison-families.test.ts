import { expect, it } from 'vitest';
import catalog from '../reference/characters/catalog.json';
import { GameModel, type Unit } from '../src/game/model';
import {
  stepAttackerVsDefenders,
  stepDefenders,
  type GarrisonDefender,
} from '../src/game/defenders';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import {
  garrisonLongShots,
  garrisonPoisonOnHit,
  garrisonStats,
  garrisonTantrum,
  garrisonTroopVersion,
} from '../src/game/garrison-kinds';
import { characterLevel, defendingCharacterLevel } from '../src/game/character-catalog';
import { createGarrisonReserve } from '../src/game/garrison-reserve';
import { garrisonUnitScales } from '../src/game/garrison-status';
import { campaignGarrisonIssues } from '../src/game/garrison-campaign';

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
  hp: 5000,
  maxHp: 5000,
  cooldown: 0,
  target: null,
  path: [],
  pathAt: 0,
  attacking: false,
  ...extra,
});
const advance = (battle: Battle, seconds: number) => {
  const steps = Math.round(seconds / 0.05);
  for (let i = 0; i < steps; i++) {
    battle.elapsed = Math.round((battle.elapsed + 0.05) * 1e9) / 1e9;
    stepDefenders(battle, 0.05, () => {});
  }
};
/** Advance until the defender records `count` attacks; returns the battle time. */
const untilAttacks = (battle: Battle, defender: GarrisonDefender, count: number, limit = 30) => {
  for (let i = 0; i < limit * 20 && (defender.attackCount ?? defender.attacks.length) < count; i++)
    advance(battle, 0.05);
  return battle.elapsed;
};

it('resolves every roster level from its pinned VisualLevel row, including the defensive Super Minion', () => {
  const table = [
    ['goblin', 7, 'Goblin', 7, { hp: 105, housing: 1, damage: 52, rate: 1, speed: 4, range: 0.4 }],
    ['archer', 9, 'Archer', 9, { hp: 56, housing: 1, damage: 31, rate: 1, speed: 3, range: 3.5 }],
    ['dragon', 5, 'Dragon', 5, { hp: 3100, housing: 20, damage: 300, rate: 1.25, splash: 0.3 }],
    ['pekka', 8, 'PEKKA', 8, { hp: 6300, housing: 25, damage: 1098, rate: 1.8, range: 0.8 }],
    ['valkyrie', 7, 'Valkyrie', 7, { hp: 1650, housing: 8, damage: 333, rate: 1.8, splash: 1 }],
    ['headhunter', 3, 'Headhunter', 3, { hp: 440, housing: 6, damage: 75, rate: 0.6, range: 3 }],
    ['superminion', 9, 'Defensive Super Minion', 6, { hp: 1600, housing: 12, damage: 325 }],
    ['babydragon', 6, 'Baby Dragon', 6, { hp: 1700, housing: 10, damage: 125, range: 2.25 }],
  ] as const;
  for (const [kind, level, character, row, values] of table)
    expect(garrisonStats(kind, level)).toMatchObject({ character, row, visualLevel: level, ...values });
  expect(garrisonStats('valkyrie', 7)).toMatchObject({
    selfAsAoeCenter: true,
    groundTargets: true,
    airTargets: false,
    firstAttackDelay: 1.2,
  });
  expect(garrisonStats('archer', 9)).toMatchObject({
    projectile: 'Arrow_small_darkElixirFire2',
    projectileSpeed: 14,
    airTargets: true,
  });
  expect(garrisonStats('headhunter', 3)).toMatchObject({
    projectile: 'Headhunter_Card_lvl3',
    preferHeroes: true,
    heroDamageScale: 4,
    ability: { name: 'HeadhunterPoison', level: 3 },
  });
  expect(garrisonPoisonOnHit(garrisonStats('headhunter', 3))).toEqual({
    spell: 'Poison',
    spellLevel: 7,
    duration: 3,
    dps: 280,
    heroDamageScale: 0.05,
    moveScale: 0.56,
    attackScale: 0.35,
    affectsAir: true,
  });
  expect(garrisonLongShots(garrisonStats('superminion', 9))).toEqual({
    count: 3,
    range: 9.75,
    projectile: 'super_gargoyle_projectile_big',
    projectileSpeed: 6,
  });
  expect(garrisonTantrum(garrisonStats('babydragon', 6))).toEqual({
    radius: 4.5,
    deactivateRadius: 4.5,
    damageScale: 2,
    attackScale: 1.5,
  });
  // A row-ordinal reading would select VisualLevel 12 (1900 HP, 385 DPS) instead.
  expect(characterLevel('Defensive Super Minion', 12)).toMatchObject({ row: 9, Hitpoints: '1900' });
  expect(defendingCharacterLevel('Super Minion', 9)?.character).toBe('Defensive Super Minion');
  expect(characterLevel('Super Minion', 3)).toBeUndefined();
  expect(catalog.levelResolution.evidence).toContainEqual(
    expect.objectContaining({
      character: 'Rocket Balloon',
      allianceUnitLevel: 10,
      rowOrdinalInRange: false,
      visualLevelResolves: true,
    }),
  );
  for (const [kind, level] of [
    ['goblin', 8],
    ['superminion', 12],
    ['dragon', 6],
  ] as const)
    expect(() => garrisonStats(kind, level)).toThrow();
  expect([garrisonTroopVersion('dragon', 7), garrisonTroopVersion('balloon', 8)]).toEqual([38, 38]);
  expect(garrisonTroopVersion('dragon', 5)).toBe(44);
  expect(garrisonTroopVersion('golem', 8)).toBeUndefined();
});

it('releases increasing housing, seeded order for equal housing and lowest level first', () => {
  const roster = [
    { kind: 'dragon', level: 7, count: 1 },
    { kind: 'goblin', level: 7, count: 2 },
    { kind: 'dragon', level: 5, count: 1 },
    { kind: 'archer', level: 9, count: 2 },
    { kind: 'balloon', level: 8, count: 3 },
  ] as const;
  const orders = new Set<string>();
  for (let seed = 1337; seed < 1437; seed++) {
    const order = createGarrisonReserve(5, [...roster], 'guard', seed).troops.map(
      (t) => `${t.kind}${t.level}`,
    );
    expect(order.slice(2)).toEqual(['balloon8', 'dragon5', 'dragon7']);
    expect(createGarrisonReserve(5, [...roster], 'guard', seed).troops.map((t) => `${t.kind}${t.level}`)).toEqual(order);
    orders.add(order.slice(0, 2).join());
  }
  // Both equal-housing orders occur across seeds; neither is a fixed alphabetical rule.
  expect(orders).toEqual(new Set(['goblin7,archer9', 'archer9,goblin7']));
  // No Flight Zone has no equal-housing tie, so its order is independent of the seed.
  for (const seed of [0, 1393, 99])
    expect(
      createGarrisonReserve(
        5,
        [
          { kind: 'dragon', level: 7, count: 1 },
          { kind: 'balloon', level: 8, count: 3 },
        ],
        'guard',
        seed,
      ).troops.map((t) => t.kind),
    ).toEqual(['balloon', 'dragon']);
});

it('names every unsupported campaign member and the bunkerless Besieged roster', () => {
  expect(campaignGarrisonIssues(56)).toEqual([]);
  expect(campaignGarrisonIssues(67)).toEqual([]);
  expect(campaignGarrisonIssues(72)).toEqual([]);
  expect(campaignGarrisonIssues(77)).toEqual([]);
  expect(campaignGarrisonIssues(69)).toEqual(['Electro Dragon 3', 'Golem 8', 'Witch 4', 'Bowler 4']);
  expect(campaignGarrisonIssues(73)).toEqual(['No source bunker', 'Electro Dragon 3']);
  expect(campaignGarrisonIssues(74)).toEqual(['Golden Dragon 1']);
  expect(campaignGarrisonIssues(76)).toEqual(['Lava Hound 6']);
  expect(campaignGarrisonIssues(83)).toEqual(['Electro Titan 2']);
  expect(campaignGarrisonIssues(89)).toEqual(['MOMMA 1']);
});

it('Goblins path to ground troops, ignore air units and strike once per source interval', () => {
  const battle = fixture();
  const goblin = spawnGarrisonDefender(battle, 'goblin', 7, 1, 6, 10, 0);
  battle.units = [unit(1, 'dragon', 6.5, 10), unit(2, 'giant', 10, 10)];
  expect(goblin.mode).toBe('ground');
  advance(battle, 0.9);
  expect(goblin.target).toBe(2);
  expect(goblin.x).toBeGreaterThan(8.5);
  const first = untilAttacks(battle, goblin, 1);
  expect(battle.units.map((u) => u.hp)).toEqual([5000, 4948]);
  untilAttacks(battle, goblin, 2);
  expect(battle.elapsed - first).toBeCloseTo(1, 9);
  expect(battle.units[1].hp).toBe(4896);
  expect(goblin.attacks.at(-1)).toMatchObject({ n: 1, hit: true, air: false });
});

it('Archer arrows track the target, resolve at source speed and never splash bystanders', () => {
  const battle = fixture();
  const archer = spawnGarrisonDefender(battle, 'archer', 9, 1, 10, 10, 0);
  battle.units = [unit(1, 'giant', 13, 10), unit(2, 'giant', 13, 10)];
  const launched = untilAttacks(battle, archer, 1);
  expect(archer.shots).toHaveLength(1);
  expect(battle.units[0].hp).toBe(5000);
  battle.units[0].x = 13.5;
  advance(battle, 0.2);
  // 3.5 tiles at 14 tiles/s arrives after 0.25 s; the moved target is still struck.
  expect(battle.units[0].hp).toBe(5000);
  advance(battle, 0.1);
  expect(archer.shots).toEqual([]);
  expect(battle.units.map((u) => u.hp)).toEqual([4969, 5000]);
  expect(archer.attacks[0]).toMatchObject({ projectile: 'Arrow_small_darkElixirFire2', hit: true });
  expect(archer.attacks[0].hitAt! - launched).toBeCloseTo(0.25, 6);
  // A shot in flight still resolves after its shooter is defeated.
  untilAttacks(battle, archer, 2);
  archer.hp = 0;
  archer.defeatedAt = battle.elapsed;
  advance(battle, 0.4);
  expect(battle.units[0].hp).toBe(4938);
});

it('PEKKA hits hard, Valkyrie spins a self-centered ground splash after her new-target delay', () => {
  const battle = fixture();
  const pekka = spawnGarrisonDefender(battle, 'pekka', 8, 1, 20, 20, 0);
  battle.units = [unit(1, 'giant', 20.5, 20, { hp: 9000, maxHp: 9000 })];
  untilAttacks(battle, pekka, 1);
  expect(battle.units[0].hp).toBe(7902);

  const second = fixture();
  const valkyrie = spawnGarrisonDefender(second, 'valkyrie', 7, 1, 10, 10, 0);
  second.units = [
    unit(1, 'giant', 10.4, 10),
    unit(2, 'swordsman', 9.2, 10.2),
    unit(3, 'archer', 11.2, 10),
    unit(4, 'dragon', 10, 10.3),
  ];
  const hit = untilAttacks(second, valkyrie, 1);
  expect(hit).toBeCloseTo(1.2, 9);
  expect(second.units.map((u) => u.hp)).toEqual([4667, 4667, 5000, 5000]);
});

it('Headhunters prefer the King, deal hero damage and apply timed source poison', () => {
  const battle = fixture();
  const headhunter = spawnGarrisonDefender(battle, 'headhunter', 3, 1, 10, 10, 0);
  battle.units = [
    unit(1, 'giant', 11, 10),
    unit(2, 'swordsman', 12.5, 10, { hero: 'king', hp: 3000, maxHp: 3000 }),
  ];
  untilAttacks(battle, headhunter, 1);
  expect(headhunter.target).toBe(2);
  advance(battle, 0.2);
  const king = battle.units[1];
  expect(battle.units[0].hp).toBe(5000);
  expect(king.late?.garrison?.poison).toMatchObject({ dps: 14, moveScale: 0.56, attackScale: 0.35 });
  expect(garrisonUnitScales(battle, king)).toEqual({ move: 0.56, attack: 0.35 });
  const hitAt = headhunter.attacks[0].hitAt!;
  const expectedPoison = 14 * (battle.elapsed - hitAt);
  expect(king.hp).toBeCloseTo(3000 - 300 - expectedPoison, 6);
  // A regular troop takes full poison damage per second for three seconds after its last hit.
  const second = fixture();
  const other = spawnGarrisonDefender(second, 'headhunter', 3, 1, 10, 10, 0);
  second.units = [unit(1, 'giant', 12, 10)];
  untilAttacks(second, other, 1);
  advance(second, 0.2);
  other.hp = 0;
  other.defeatedAt = second.elapsed;
  const poisoned = second.units[0];
  const start = other.attacks[0].hitAt!;
  advance(second, 4);
  expect(poisoned.hp).toBeCloseTo(5000 - 75 - 280 * 3, 6);
  expect(poisoned.late?.garrison?.poison).toBeUndefined();
  expect(garrisonUnitScales(second, poisoned)).toEqual({ move: 1, attack: 1 });
  expect(start).toBeGreaterThan(0);
});

it('Defensive Super Minions fire three long-range big rockets before closing to normal range', () => {
  const battle = fixture();
  const minion = spawnGarrisonDefender(battle, 'superminion', 9, 1, 10, 10, 0);
  battle.units = [unit(1, 'giant', 19, 10, { hp: 20000, maxHp: 20000 })];
  untilAttacks(battle, minion, 3);
  expect(minion.x).toBe(10);
  expect(minion.attacks.map((a) => [a.long, a.projectile])).toEqual([
    [true, 'super_gargoyle_projectile_big'],
    [true, 'super_gargoyle_projectile_big'],
    [true, 'super_gargoyle_projectile_big'],
  ]);
  untilAttacks(battle, minion, 4);
  expect(minion.attacks.at(-1)).toMatchObject({ projectile: 'super_gargoyle_projectile' });
  expect(19 - minion.x).toBeLessThanOrEqual(3.5 + 1e-6);
  expect(minion.longShots).toBe(3);
});

it('Baby Dragons enter Tantrum only without another flying defender nearby', () => {
  const run = (withAlly: boolean) => {
    const battle = fixture();
    const baby = spawnGarrisonDefender(battle, 'babydragon', 6, 1, 10, 10, 0);
    // A stunned Dragon still counts as a nearby flying ally but deals no damage of its own.
    if (withAlly) spawnGarrisonDefender(battle, 'dragon', 5, 1, 12, 12, 0).stunnedUntil = 999;
    battle.units = [unit(1, 'giant', 12.2, 10, { hp: 50000, maxHp: 50000 })];
    const first = untilAttacks(battle, baby, 1);
    const second = untilAttacks(battle, baby, 2);
    advance(battle, 0.6);
    return { baby, first, interval: second - first, battle };
  };
  const alone = run(false);
  expect(alone.baby.tantrum).toBe(true);
  expect(alone.first).toBeCloseTo(0.7, 9);
  expect(alone.interval).toBeCloseTo(0.7, 9);
  const escorted = run(true);
  expect(escorted.baby.tantrum).toBe(false);
  expect(escorted.first).toBeCloseTo(1, 9);
  expect(escorted.interval).toBeCloseTo(1, 9);
  const damage = (r: ReturnType<typeof run>) =>
    r.battle.units[0].maxHp - r.battle.units[0].hp;
  expect(damage(alone) / alone.baby.attacks.filter((a) => a.hit).length).toBe(250);
  expect(damage(escorted) / escorted.baby.attacks.filter((a) => a.hit).length).toBe(125);
});

it('lets ground attackers path to leveled garrison defenders as troop points', () => {
  const battle = fixture();
  for (const [kind, level] of [
    ['goblin', 7],
    ['dragon', 7],
  ] as const) {
    const defender = spawnGarrisonDefender(battle, kind, level, 1, 16, 10, 0);
    defender.alerted = true;
    const attacker = unit(1, 'archer', 10, 10);
    battle.units = [attacker];
    const retaliating = stepAttackerVsDefenders(
      battle,
      attacker,
      { damage: 10, speed: 3, range: 3.5, rate: 1 },
      0.05,
      [],
      () => {},
      () => {},
    );
    expect(retaliating, kind).toBe(true);
    expect(attacker.defenderTarget, kind).toBe(defender.id);
    expect(attacker.path.length, kind).toBeGreaterThan(0);
    defender.hp = 0;
  }
});

it('keeps new-family combat, projectiles and poison deterministic through JSON restoration', () => {
  const battle = fixture();
  for (const [kind, level, x] of [
    ['goblin', 7, 6],
    ['archer', 9, 7],
    ['headhunter', 3, 8],
    ['valkyrie', 7, 9],
    ['superminion', 9, 10],
    ['babydragon', 6, 11],
    ['pekka', 8, 12],
    ['dragon', 5, 13],
  ] as const)
    spawnGarrisonDefender(battle, kind, level, 1, x, 6, 0);
  battle.units = [
    unit(1, 'giant', 10, 12),
    unit(2, 'dragon', 12, 12),
    unit(3, 'swordsman', 9, 13, { hero: 'king' }),
  ];
  advance(battle, 2.5);
  const restored = JSON.parse(JSON.stringify(battle));
  advance(battle, 6);
  advance(restored, 6);
  expect(restored).toEqual(battle);
  expect(battle.defenders!.every((d) => d.kind === 'skeleton' || d.attacks.length <= 16)).toBe(true);
});
