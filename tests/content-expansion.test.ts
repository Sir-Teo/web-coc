import { describe, it, expect } from 'vitest';
import { GameModel, makeBuilding } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { TROOP_KEYS, maxTroopLevel } from '../src/game/data';
import { nativeRow, seconds } from '../src/game/native-data';
import { superOriginal } from '../src/game/special-troops';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
import { bakedDirection, bakedFrame } from '../src/game/hero-native-scene';
import { hurtUnit } from '../src/game/native-status';
function arena() {
  const m = new GameModel();
  m.state.obstacles = [];
  m.state.buildings = [
    makeBuilding(1, 'townhall', 30, 30, 11),
    makeBuilding(2, 'goldstorage', 15, 15, 10),
    makeBuilding(3, 'cannon', 20, 20, 10),
  ];
  m.state.army = { ...emptyArmy(), trooplauncher: 1, sneakygoblin: 1 };
  m.state.spells = { ...emptySpells(), freeze: 1 };
  m.state.nextId = 5000;
  m.startBattle(0, true);
  return m;
}
const run = (m: GameModel, t: number) => {
  for (let i = 0; i < t / 0.05; i++) m.step(0.05);
};
describe('content expansion', () => {
  it('trains siege machines from a completed Workshop and caps its reserve', () => {
    const m = new GameModel();
    m.clearArmy();
    m.state.buildings.push(makeBuilding(90, 'workshop', 30, 30, 8));
    m.train('trooplauncher');
    expect(m.state.army.trooplauncher).toBe(1);
    m.train('wallwrecker', 2);
    expect(m.state.army.wallwrecker).toBe(2);
    m.train('battleblimp');
    expect(m.state.army.battleblimp).toBe(0);
  });
  it('super boosts charge once, require base levels, expire and use the correct source row', () => {
    const m = new GameModel();
    m.townhall!.level = 11;
    m.state.dark = 100000;
    m.state.troopLevels = Object.fromEntries(TROOP_KEYS.map((k) => [k, maxTroopLevel(k)])) as any;
    m.boostSuperTroop('superbarbarian');
    expect(m.state.dark).toBe(75000);
    m.boostSuperTroop('superbarbarian');
    expect(m.state.dark).toBe(75000);
    expect(m.troopLevel('superbarbarian')).toBe(maxTroopLevel('superbarbarian'));
    expect(m.troopUnlocked('superbarbarian')).toBe(true);
    m.state.superBoosts!.superbarbarian = Date.now() - 1;
    expect(m.troopUnlocked('superbarbarian')).toBe(false);
  });
  it('Troop Launcher fires a barrel and releases the source mixed troop group', () => {
    const m = arena();
    m.activeTroop = 'trooplauncher';
    expect(m.deploy(10, 10)).toBe(true);
    run(m, 5);
    for (const kind of ['giant', 'swordsman', 'archer', 'wallbreaker'])
      expect(
        m.battle!.units.some((u) => u.kind === kind),
        kind,
      ).toBe(true);
  });
  it('Sneaky Goblin gains temporary deployment invisibility', () => {
    const m = arena();
    m.activeTroop = 'sneakygoblin';
    m.deploy(5, 5);
    run(m, 0.1);
    const u = m.battle!.units[0];
    expect(u.native?.effects?.invisibleUntil).toBeGreaterThan(m.battle!.elapsed);
    run(m, 6);
    expect(u.native!.effects!.invisibleUntil).toBeLessThan(m.battle!.elapsed);
  });
  it('new Freeze casts honor the source deploy delay', () => {
    const m = arena();
    m.activeSpell = 'freeze';
    m.castSpell(21, 21);
    const cast = m.battle!.nativeSpells![0];
    expect(cast.name).toBe('Freeze');
    expect(cast.firstHit).toBe(
      seconds(nativeRow('spells', 'Freeze'), 'DeployTimeMS') +
        seconds(nativeRow('spells', 'Freeze'), 'ChargingTimeMS') +
        seconds(nativeRow('spells', 'Freeze'), 'HitTimeMS'),
    );
    run(m, cast.firstHit + 0.1);
    expect(m.battle!.defenseStuns[3]).toBeGreaterThan(m.battle!.elapsed);
  });
  it('defending heroes engage nearby attackers and survive portable replay round trips', () => {
    const m = arena();
    m.battle = null;
    m.state.buildings.push(makeBuilding(4, 'herohall', 10, 10, 1));
    m.state.king = { level: 1 };
    m.state.heroLineup = ['king'];
    m.startBattle(0, true);
    const d = m.battle!.defenders!.find((d) => d.kind === 'hero')!;
    m.activeTroop = 'sneakygoblin';
    m.deploy(5, 5);
    const u = m.battle!.units[0];
    u.x = d.x + 0.5;
    u.y = d.y;
    u.native = undefined;
    const hp = u.hp;
    run(m, 0.1);
    expect(u.hp).toBeLessThan(hp);
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    const copied = parseReplayFile(JSON.stringify(makeReplayFile(replay)));
    expect(copied.initial.defendingHeroes).toEqual(replay.initial.defendingHeroes);
    expect(replayBattle(replay.initial, 51).defenders).toBeUndefined();
  });
  it('baked frames preserve directional ordering and clamp a non-looping death clip', () => {
    expect(bakedDirection(1, -1)).toBe(0);
    expect(bakedDirection(1, 1)).toBe(2);
    const a = { image: 'x', x: 0, y: 0, w: 1, h: 1, anchorX: 0, anchorY: 1 },
      b = { ...a, x: 1 };
    expect(bakedFrame({ fps: 10, loop: false, frames: [[a, b]] }, 0, 10)).toBe(b);
  });
});

function equipped(kind: 'king' | 'queen' | 'prince' | 'duke', slug: string) {
  const m = arena();
  m.battle!.nativeHeroRoster = true;
  m.battle!.nativeHeroes = [{ kind, level: 1, items: [{ slug, level: 1 }], unitId: null }];
  expect(m.deployNativeHero(kind, 8, 8)).toBe(true);
  return { m, hero: m.battle!.nativeHeroes[0], unit: m.battle!.units[0] };
}
describe('equipment behaviors', () => {
  it('Snake Bracelet reacts to cumulative damage and spawns snakes', () => {
    const { m, unit } = equipped('king', 'snake-bracelet');
    hurtUnit(m.battle!, unit, 600);
    run(m, 0.2);
    expect(m.battle!.units.filter((u) => u.kind === 'snake').length).toBe(2);
  });
  it('Dark Crown applies the highest crossed loss threshold once', () => {
    const { m, unit } = equipped('prince', 'dark-crown');
    const hp = unit.maxHp;
    for (let i = 0; i < 3; i++)
      m.battle!.units.push({
        ...unit,
        id: 900 + i,
        kind: 'pekka',
        hero: undefined,
        hp: 0,
        native: undefined,
      });
    run(m, 0.1);
    expect(unit.maxHp).toBeGreaterThan(hp);
    const boosted = unit.maxHp;
    run(m, 0.1);
    expect(unit.maxHp).toBe(boosted);
  });
  it('Meteor Staff targets a defense on its source cooldown', () => {
    const { m, unit } = equipped('prince', 'meteor-staff');
    unit.native!.effects = { frozenUntil: 100 };
    run(m, 10.1);
    expect(m.battle!.nativeSpells?.some((s) => s.name === 'MPMeteorStaffSpell')).toBe(true);
  });
  it('Monolith Arrow launches the selected native projectile with percentage damage', () => {
    const { m, unit } = equipped('queen', 'monolith-arrow');
    unit.x = 14;
    unit.y = 15;
    unit.target = 2;
    run(m, 0.1);
    const shot = m.battle!.projectiles?.find((p) => p.sourceId === unit.id);
    expect(shot?.native?.name).toBe('ArcherQueenMonolithProjectile3');
    expect(shot!.damage).toBeGreaterThan(m.battle!.buildings[1].maxHp * 0.09);
  });
  it('Revenge Deck reflects toward the recorded damage source after a hit', () => {
    const { m, unit } = equipped('duke', 'draconic-counter');
    hurtUnit(m.battle!, unit, 100, m.battle!.elapsed, 3);
    run(m, 0.1);
    const reflected = m.battle!.projectiles?.find(
      (p) => p.native?.name === 'ddreversalcardprojectile',
    );
    expect(reflected?.targetId).toBe(3);
    expect(reflected?.damage).toBe(150);
  });
  it('Rocket Backpack moves through the map and damages each crossed building once', () => {
    const { m, hero, unit } = equipped('duke', 'rocket-backpack');
    m.activateNativeHeroAbility('duke');
    const x = unit.x;
    run(m, 0.5);
    expect(hero.abilityUsed).toBe(true);
    expect(unit.x).toBeGreaterThan(x);
    run(m, 1);
    expect(m.battle!.buildings[1].hp).toBeLessThan(m.battle!.buildings[1].maxHp);
  });
});
