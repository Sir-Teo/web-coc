import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import {
  NATIVE_CAMPAIGN,
  freshNativeCampaign,
  goblinMap,
  nativeBuildings,
  nativeCampaignIssues,
  nativeUnlocked,
  validNativeCampaign,
} from '../src/game/native-campaign';
import { BUILDINGS, isTrap } from '../src/game/data';
import { BUILD_MIN, MAP_SIZE } from '../src/game/grid';
import { migrateSave, validateSave } from '../src/game/save';

const family = (name: 'goblin' | 'challenge' | 'forged') =>
  NATIVE_CAMPAIGN.filter((stage) => (stage.family ?? 'goblin') === name);

it('runs 150 villages: the Goblin map, the playable Challenges and the forged tail', () => {
  expect(NATIVE_CAMPAIGN).toHaveLength(150);
  expect(family('goblin')).toHaveLength(90);
  expect(family('challenge')).toHaveLength(13);
  expect(family('forged')).toHaveLength(47);
  // Stage numbers are the campaign's own order, unbroken across the three families.
  expect(NATIVE_CAMPAIGN.map((s) => s.stage)).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
  expect(new Set(NATIVE_CAMPAIGN.map((s) => s.name)).size).toBe(150);
  // Goblin identities (Goblin Hall, Goblin Hut, Tutorial Cannon) belong to the Goblin map only.
  expect(family('goblin').every(goblinMap)).toBe(true);
  expect(family('challenge').some(goblinMap)).toBe(false);
  expect(family('forged').some(goblinMap)).toBe(false);
});

it('keeps every village playable, inside the board and reachable in order', () => {
  for (const [index, stage] of NATIVE_CAMPAIGN.entries()) {
    expect(nativeCampaignIssues(index), stage.name).toEqual([]);
    for (const b of nativeBuildings(index)) {
      const size = BUILDINGS[b.kind].size;
      expect(b.x, stage.name).toBeGreaterThanOrEqual(BUILD_MIN);
      expect(b.y, stage.name).toBeGreaterThanOrEqual(BUILD_MIN);
      // A campaign layout may use the whole board, not only the home village's build area.
      expect(b.x + size, stage.name).toBeLessThanOrEqual(MAP_SIZE);
      expect(b.y + size, stage.name).toBeLessThanOrEqual(MAP_SIZE);
    }
    // Every dependency points at a village earlier in the campaign.
    for (const dependency of stage.dependencies) expect(dependency).toBeLessThan(stage.stage);
  }
  // The forged tail is a chain: one star on the village before opens the next.
  const stars = Array(NATIVE_CAMPAIGN.length).fill(0);
  const first = NATIVE_CAMPAIGN.findIndex((s) => s.family === 'forged');
  expect(nativeUnlocked(first, stars)).toBe(false);
  stars[first - 1] = 1;
  expect(nativeUnlocked(first, stars)).toBe(true);
  expect(nativeUnlocked(first + 1, stars)).toBe(false);
});

it('gives every forged village a Town Hall, defenses, loot and walls worth breaking', () => {
  let previous = 0;
  for (const stage of family('forged')) {
    const kinds = nativeBuildings(NATIVE_CAMPAIGN.indexOf(stage)).map((b) => b.kind);
    expect(
      kinds.filter((k) => k === 'townhall'),
      stage.name,
    ).toHaveLength(1);
    expect(kinds.filter((k) => k === 'wall').length, stage.name).toBeGreaterThan(40);
    expect(kinds.filter((k) => k === 'cannon' || k === 'archertower').length).toBeGreaterThan(6);
    expect(stage.traps.length, stage.name).toBeGreaterThan(8);
    expect(stage.gold, stage.name).toBeGreaterThan(previous);
    previous = stage.gold;
    // Difficulty climbs, and never past the Town Hall the imported villages reach.
    expect(stage.recommendedTownHall!).toBeGreaterThanOrEqual(9);
    expect(stage.recommendedTownHall!).toBeLessThanOrEqual(16);
  }
  // Forged villages carry no Goblin-only or late-family entity, so none needs a source state.
  for (const stage of family('forged')) {
    expect(stage.infernoStates ?? []).toEqual([]);
    expect(stage.lateStates ?? []).toEqual([]);
    expect(stage.activeModes).toEqual([]);
    expect(stage.allianceDefenders).toEqual([]);
    expect(stage.traps.every(([id]) => id >= 12000000)).toBe(true);
  }
});

it('places only entity levels an imported village already proves', () => {
  const proven = new Map<number, Set<number>>();
  for (const stage of NATIVE_CAMPAIGN)
    if (stage.family !== 'forged')
      for (const [id, , , level] of [...stage.buildings, ...stage.traps])
        proven.set(id, (proven.get(id) ?? new Set()).add(level));
  for (const stage of family('forged'))
    for (const [id, , , level] of [...stage.buildings, ...stage.traps])
      expect(proven.get(id)?.has(level), `${stage.name}: ${id} level ${level}`).toBe(true);
});

it('reproduces the forged villages exactly from the generator', () => {
  const before = readFileSync('reference/campaign/generated.json', 'utf8');
  // --check throws when a rerun would write anything else.
  execFileSync('node', ['scripts/generate-campaign-stages.mjs', '--check'], { stdio: 'pipe' });
  expect(readFileSync('reference/campaign/generated.json', 'utf8')).toBe(before);
});

it('extends a village saved before the campaign grew, keeping its stars and loot', () => {
  const m = new GameModel();
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars[3] = 2;
  m.state.nativeCampaign.remaining[3] = { gold: 1, elixir: 2, dark: 0 };
  // A save written when the campaign was ninety villages long.
  const old = structuredClone(m.state);
  old.nativeCampaign!.stars.length = 90;
  old.nativeCampaign!.remaining.length = 90;
  expect(validNativeCampaign(old.nativeCampaign)).toBe(false);
  const migrated = migrateSave(old);
  expect(validateSave(migrated)).toBe(true);
  const progress = (migrated as typeof old).nativeCampaign!;
  expect(progress.stars).toHaveLength(150);
  expect(progress.stars[3]).toBe(2);
  expect(progress.remaining[3]).toEqual({ gold: 1, elixir: 2, dark: 0 });
  expect(progress.remaining[149]).toEqual({
    gold: NATIVE_CAMPAIGN[149].gold,
    elixir: NATIVE_CAMPAIGN[149].elixir,
    dark: NATIVE_CAMPAIGN[149].darkElixir,
  });
});

it('finishes a forged raid through the normal scoring and loot path', () => {
  const index = NATIVE_CAMPAIGN.findIndex((s) => s.family === 'forged');
  const m = new GameModel();
  m.state.nativeCampaign = freshNativeCampaign();
  m.state.nativeCampaign.stars.fill(1);
  m.state.army.giant = 5;
  m.startCampaign(index);
  expect(m.battle!.catalog).toBe('goblin-v1');
  m.discardRecording();
  // Concealed Teslas shrug off damage until they reveal, so this is a two-star wipe.
  for (const b of m.battle!.buildings) if (!isTrap(b.kind)) m.damage(b, b.hp);
  m.finishBattle();
  expect(m.state.nativeCampaign!.stars[index]).toBeGreaterThanOrEqual(2);
  expect(m.state.gold).toBeGreaterThan(0);
  expect(validateSave(m.state)).toBe(true);
});
