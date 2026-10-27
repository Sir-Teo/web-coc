import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { GARRISON_KINDS, garrisonStats } from '../src/game/garrison-kinds';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonSoundCues } from '../src/game/garrison-sounds';
import { effectCue } from '../src/game/troop-sounds';
import source from '../reference/troop-sounds/sounds.json';
import { garrisonSoundEffects } from '../src/game/garrison-native-sounds';
import { initializeGarrison } from '../src/game/garrison-release';
import { makeBuilding } from '../src/game/model';

function arena() {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  (battle as typeof battle & { nativeGarrisonSounds?: true }).nativeGarrisonSounds = true;
  battle.defenders = [];
  return battle;
}

it('captures every enabled source VisualLevel and defensive substitution', () => {
  expect(Object.keys(source.garrisons)).toHaveLength(21);
  expect(Object.values(source.garrisons).flatMap((levels) => Object.keys(levels))).toHaveLength(22);
  for (const [kind, entry] of Object.entries(GARRISON_KINDS))
    for (const level of Object.keys(entry.levels).map(Number)) {
      const stats = garrisonStats(kind as keyof typeof GARRISON_KINDS, level),
        binding = (
          source.garrisons as Record<string, Record<string, { name: string; row: number }>>
        )[kind][level];
      expect(binding).toMatchObject({ name: stats.character, row: stats.row });
    }
  expect(source.garrisons.superminion[9]).toMatchObject({ name: 'Defensive Super Minion', row: 6 });
  expect(source.garrisons.lavahound[6].name).toBe('Defensive Lava Hound');
});

for (const kind of Object.keys(GARRISON_KINDS) as (keyof typeof GARRISON_KINDS)[]) {
  if (kind === 'dragon' || kind === 'balloon') continue;
  it(`${kind} plays its declared primary source cues once on the retained event clocks`, () => {
    const b = arena(),
      level = Number(Object.keys(GARRISON_KINDS[kind].levels)[0]),
      d = spawnGarrisonDefender(b, kind, level, 1, 10, 10, 0.1);
    d.attacks.push({
      at: 1,
      x: 10,
      y: 10,
      targetId: 100,
      targetX: 11,
      targetY: 10,
      n: 40,
      hitAt: 1.4,
      hit: true,
    });
    d.defeatedAt = 2;
    d.hp = 0;
    b.elapsed = 2.05;
    const before = JSON.stringify(b),
      binding = (
        source.garrisons as Record<string, Record<string, Record<string, string | number>>>
      )[kind][level],
      expected = ['deploy', 'attack', 'hit', 'die'].flatMap((event) => {
        const effect = binding[event];
        const key = `garrison:${d.id}:${event === 'attack' || event === 'hit' ? `${event}:40` : event}`;
        return typeof effect === 'string'
          ? [
              effectCue(
                effect,
                key,
                event === 'deploy' ? 0.1 : event === 'attack' ? 1 : event === 'hit' ? 1.4 : 2,
              ),
            ]
          : [];
      });
    expect(expected.length).toBeGreaterThan(0);
    const cues = garrisonSoundCues(b);
    expect(cues).toEqual(expected);
    expect(new Set(cues.map((cue) => cue.key)).size).toBe(cues.length);
    expect(garrisonSoundCues(JSON.parse(JSON.stringify(b)))).toEqual(cues);
    expect(JSON.stringify(b)).toBe(before);
  });
}

it('a defensive Super Minion plays its hit only after an actual successful projectile impact', () => {
  const b = arena(),
    d = spawnGarrisonDefender(b, 'superminion', 9, 1, 10, 10, 0),
    attack = {
      at: 1,
      x: 10,
      y: 10,
      targetId: 100,
      targetX: 15,
      targetY: 10,
      n: 7,
      projectile: 'super_gargoyle_projectile_big',
    };
  d.attacks.push(attack);
  b.elapsed = 1.1;
  expect(garrisonSoundCues(b).some((cue) => cue.key === `garrison:${d.id}:attack:7`)).toBe(true);
  expect(garrisonSoundCues(b).some((cue) => cue.key === `garrison:${d.id}:hit:7`)).toBe(false);
  Object.assign(attack, { hitAt: 1.9, hit: false });
  b.elapsed = 1.9;
  expect(garrisonSoundCues(b).some((cue) => cue.key === `garrison:${d.id}:hit:7`)).toBe(false);
  Object.assign(attack, { hit: true });
  expect(garrisonSoundCues(b).find((cue) => cue.key === `garrison:${d.id}:hit:7`)).toMatchObject({
    at: 1.9,
  });
});

it('Electro Dragon secondary arcs use separate original chain and hit cues', () => {
  const b = arena(),
    d = spawnGarrisonDefender(b, 'electrodragon', 3, 1, 10, 10, 0);
  d.attacks.push({
    at: 1,
    x: 10,
    y: 10,
    targetId: 100,
    targetX: 11,
    targetY: 10,
    n: 4,
    hitAt: 1,
    hit: true,
    chain: [
      { targetId: 101, at: 1.3, fromX: 11, fromY: 10, x: 12, y: 10, air: false, damage: 100 },
      { targetId: 102, at: 1.4, fromX: 12, fromY: 10, x: 13, y: 10, air: false, damage: 100 },
    ],
  });
  b.elapsed = 1.35;
  const cues = garrisonSoundCues(b);
  expect(cues.filter((cue) => cue.key.includes(':chain'))).toEqual([
    effectCue('Electro Dragon Attack Chain', `garrison:${d.id}:chain:4:0`, 1.3),
    effectCue('Mega Tesla Hit', `garrison:${d.id}:chain-hit:4:0`, 1.3),
  ]);
  b.elapsed = 12;
  expect(garrisonSoundCues(b)).toEqual([]);
});

it('the old Dragon/Balloon path stays exact and old late-garrison playback stays silent', () => {
  const b = arena();
  spawnGarrisonDefender(b, 'dragon', 7, 1, 10, 10, 0);
  spawnGarrisonDefender(b, 'balloon', 8, 1, 11, 10, 0);
  spawnGarrisonDefender(b, 'royalghost', 7, 1, 12, 10, 0);
  const current = garrisonSoundCues(b);
  delete (b as typeof b & { nativeGarrisonSounds?: true }).nativeGarrisonSounds;
  const old = garrisonSoundCues(b);
  expect(current.filter((cue) => cue.sample.startsWith('garrison-'))).toEqual(old);
  expect(old.every((cue) => cue.sample.startsWith('garrison-'))).toBe(true);
  expect(current.some((cue) => cue.sample === 'troop-groy_dep_01.ogg')).toBe(true);
});

it('warms source secondaries and summons from the unreleased reserve without requesting unrelated Ghost samples', () => {
  const b = arena();
  b.garrisons = [
    initializeGarrison({
      castleId: 1,
      mode: 'guard',
      troops: [
        { kind: 'golem', level: 8, count: 1 },
        { kind: 'witch', level: 4, count: 1 },
        { kind: 'lavahound', level: 6, count: 1 },
      ],
    }),
  ];
  const before = JSON.stringify(b),
    effects = garrisonSoundEffects(b);
  for (const effect of [
    'Golem Deploy',
    'Golem_split',
    'Small Golem Attack',
    'Golem_die',
    'Warlock Deploy',
    'Skeleton Attack',
    'Skeleton Die',
    'Tiny Deploy',
    'Tinymite Attack',
    'Tinymite Die',
  ])
    expect(effects.has(effect), effect).toBe(true);
  expect(effects.has('Ghost_deploy')).toBe(false);
  expect(JSON.stringify(b)).toBe(before);
  delete b.nativeGarrisonSounds;
  expect(garrisonSoundEffects(b).size).toBe(0);
});

it('warms Royal Ghost samples from an untriggered Ghost Trap', () => {
  const b = arena(),
    trap = makeBuilding(500, 'skeletontrap', 10, 10, 1);
  trap.npc = 'ghost-trap';
  b.buildings.push(trap);
  expect(garrisonSoundEffects(b)).toEqual(
    new Set(['Ghost_deploy', 'Ghost_sword', 'IceWizard Hit1', 'Ghost_sword_vo']),
  );
});
