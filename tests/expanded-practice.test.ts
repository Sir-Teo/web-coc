import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import { freshNativeCampaign, NATIVE_CAMPAIGN } from '../src/game/native-campaign';
import { practiceLevelAt } from '../src/game/practice-mode';
import { validateReplay, replayBattle } from '../src/game/replay';
import { migrateSave, validateSave } from '../src/game/save';
import { TROOP_KEYS } from '../src/game/data';
import { ladderOpponent } from '../src/game/ladder';

it.each([
  [150, 'Angry Babies'],
  [151, 'Flying Circus'],
  [152, 'Whirl Power'],
  [153, 'Yeti Smash'],
] as const)(
  'fields appended Practice index %i with its complete source army and replay',
  (index, name) => {
    const m = new GameModel();
    m.townhall!.level = 12;
    m.clearArmy();
    const home = structuredClone(m.state.army);
    const level = practiceLevelAt(index)!;
    expect(level.name).toBe(name);
    expect(level.steps.length).toBeGreaterThan(0);
    expect(level.heroes.length).toBeGreaterThan(0);
    m.startCampaign(index, false);
    const b = m.battle!;
    expect(b.fixedArmy).toBe(true);
    expect(b.boardSize).toBe(52);
    expect(b.remaining).toEqual(level.army);
    if (index === 152)
      expect(b.garrisons![0].troops).toEqual([{ kind: 'balloon', level: 5, count: 5 }]);
    if (index === 153)
      expect(b.garrisons![0].troops).toEqual([
        { kind: 'babydragon', level: 6, count: 1 },
        { kind: 'lavahound', level: 5, count: 1 },
      ]);
    m.activeTroop = TROOP_KEYS.find((k) => b.remaining[k] > 0)!;
    expect(m.deploy(51, 1)).toBe(true);
    m.step(0.05);
    m.finishBattle();
    const data = m.state.raidLog![0].replay!;
    expect(validateReplay(data)).toBe(true);
    expect(replayBattle(data.initial, data.version).boardSize).toBe(52);
    expect(m.state.army).toEqual(home);
  },
);

it.each([150, 152])(
  'extends a %i-stage save while preserving stars and enemy inventory',
  (length) => {
    const m = new GameModel();
    m.state.nativeCampaign = freshNativeCampaign();
    const old = structuredClone(m.state);
    old.nativeCampaign!.stars = Array.from({ length }, (_, i) => i % 4);
    old.nativeCampaign!.remaining.length = length;
    old.nativeCampaign!.remaining[length - 1] = { gold: 1, elixir: 2, dark: 3 };
    const prior = structuredClone(old.nativeCampaign!);
    const migrated = migrateSave(old) as typeof old;
    expect(validateSave(migrated)).toBe(true);
    const progress = migrated.nativeCampaign!;
    expect(progress.stars.slice(0, length)).toEqual(prior.stars);
    expect(progress.remaining.slice(0, length)).toEqual(prior.remaining);
    expect(progress.stars.slice(length)).toEqual(Array(154 - length).fill(0));
    for (let index = length; index < 154; index++)
      expect(progress.remaining[index]).toEqual({
        gold: NATIVE_CAMPAIGN[index].gold,
        elixir: NATIVE_CAMPAIGN[index].elixir,
        dark: NATIVE_CAMPAIGN[index].darkElixir,
      });
  },
);

it('keeps the new full-map lessons out of the existing ladder geometry era', () => {
  for (const townhall of [9, 12])
    for (let seed = 0; seed < 100; seed++)
      expect(ladderOpponent(seed, townhall, 1000).index).toBeLessThan(150);
});

it.each([
  [152, 5],
  [153, 2],
] as const)('releases the complete source roster at Practice index %i', (index, count) => {
  const m = new GameModel();
  m.townhall!.level = 12;
  m.startCampaign(index, false);
  m.discardRecording();
  const b = m.battle!;
  const castle = b.buildings.find((v) => v.id === b.garrisons![0].castleId)!;
  b.started = true;
  b.units.push({
    id: 100000,
    kind: 'giant',
    x: castle.x - 1,
    y: castle.y + 1,
    hp: 1000000,
    maxHp: 1000000,
    cooldown: 0,
    target: null,
    path: [],
    pathAt: 0,
    attacking: false,
  });
  const troops = () =>
    b.defenders!.filter(
      (d) =>
        d.kind !== 'hero' &&
        d.kind !== 'skeleton' &&
        d.kind !== 'guardian' &&
        d.kind !== 'repairer',
    );
  for (let i = 0; i < 200 && troops().length < count; i++) m.step(0.05);
  expect(troops().map((d) => [d.kind, d.level])).toEqual(
    index === 152
      ? Array.from({ length: 5 }, () => ['balloon', 5])
      : [
          ['babydragon', 6],
          ['lavahound', 5],
        ],
  );
});
