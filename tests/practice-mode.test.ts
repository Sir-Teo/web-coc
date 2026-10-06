import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/game/model';
import {
  PRACTICE_LEVELS,
  PRACTICE_TEXTS,
  PRACTICE_TOWN_HALL,
  practiceLevelAt,
} from '../src/game/practice-mode';
import { NATIVE_CAMPAIGN, freshNativeCampaign } from '../src/game/native-campaign';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { STARTER_CHALLENGES } from '../src/game/starter-challenges';

/** Giant Smash, the first Practice level: campaign stage 91. */
const GIANT_SMASH = 90;
const held = (record: Record<string, number>) =>
  Object.fromEntries(Object.entries(record).filter(([, n]) => n));

function village(townhall: number) {
  const m = new GameModel();
  m.townhall!.level = townhall;
  m.state.gold = m.state.elixir = 0;
  m.clearArmy();
  return m;
}

describe('Practice Mode', () => {
  it('reads the client’s 19 levels, the 13 this game fields being campaign stages 91 to 103', () => {
    expect(PRACTICE_LEVELS).toHaveLength(19);
    expect(PRACTICE_TOWN_HALL).toBe(4);
    expect(PRACTICE_TEXTS).toMatchObject({
      title: 'Practice',
      unlocks: 'Practice mode unlocks at Town Hall 4',
    });
    const fielded = PRACTICE_LEVELS.filter((level) => level.stage);
    expect(fielded.map((level) => level.stage)).toEqual(
      Array.from({ length: 13 }, (_, i) => 91 + i),
    );
    for (const level of fielded) {
      const stage = NATIVE_CAMPAIGN[level.stage! - 1];
      expect(stage.family).toBe('challenge');
      expect(stage.name).toBe(level.name);
      expect(practiceLevelAt(level.stage! - 1)).toBe(level);
    }
    // Every unit of every army is one this game knows.
    for (const level of PRACTICE_LEVELS) {
      expect(Object.values(level.army).some(Boolean), level.id).toBe(true);
      expect(Object.keys(held(level.army)).every((k) => level.troopLevels[k as 'giant'] >= 1)).toBe(
        true,
      );
      for (const hero of level.heroes) expect(hero.kind, level.id).toBeTruthy();
    }
    expect(practiceLevelAt(0)).toBeUndefined();
  });

  it('gives each level the army the client lists, at its levels', () => {
    const smash = practiceLevelAt(GIANT_SMASH)!;
    expect(smash.name).toBe('Giant Smash');
    expect(held(smash.army)).toEqual({ giant: 13, wallbreaker: 2, goblin: 11 });
    expect(smash.troopLevels).toMatchObject({ giant: 2, wallbreaker: 2, goblin: 2 });
    expect(smash.heroes).toEqual([]);
    // Hot Stuff: Dragons, Lightning and a level 5 King with his two default items.
    const hot = PRACTICE_LEVELS.find((level) => level.id === 'CHALLENGE_TH7_DRAGON')!;
    expect(held(hot.army)).toEqual({ dragon: 10 });
    expect(held(hot.spells)).toEqual({ lightning: 6 });
    expect(hot.spellLevels.lightning).toBe(4);
    expect(hot.heroes).toEqual([
      {
        kind: 'king',
        level: 5,
        items: [
          { slug: 'barbarian-puppet', level: 1 },
          { slug: 'rage-vial', level: 1 },
        ],
      },
    ]);
    // Bowling with Bats: the Clan Castle's units join the army, at the army's own levels.
    const bats = PRACTICE_LEVELS.find((level) => level.id === 'CHALLENGE_TH10_BOBAT')!;
    expect(bats.castle).toEqual([
      ['giant', 2],
      ['pekka', 1],
    ]);
    expect(bats.army.pekka).toBe(5);
    expect(bats.troopLevels.pekka).toBe(6);
    expect(bats.troopLevels.giant).toBe(9);
  });

  it('opens a level at its Town Hall', () => {
    const toasts: string[] = [];
    const m = village(3);
    m.onToast = (message) => toasts.push(message);
    expect(m.campaignOpen(GIANT_SMASH)).toBe(false);
    m.startCampaign(GIANT_SMASH);
    expect(m.battle).toBeNull();
    expect(toasts.at(-1)).toBe('Giant Smash opens at Town Hall 4.');
    m.townhall!.level = 4;
    expect(m.campaignOpen(GIANT_SMASH)).toBe(true);
    // The Goblin map's own villages are not Town Hall gated.
    expect(m.campaignOpen(0)).toBe(true);
  });

  it('attacks with the level’s army, leaving the player’s own at home', () => {
    const m = village(4);
    m.train('archer');
    const home = structuredClone(m.state.army);
    const last = structuredClone(m.state.lastArmy);
    m.startCampaign(GIANT_SMASH, false); // Without the guide (practice-guide.test.ts).
    const b = m.battle!;
    expect(b.fixedArmy).toBe(true);
    expect(held(b.remaining)).toEqual({ giant: 13, wallbreaker: 2, goblin: 11 });
    expect(b.troopLevels!.giant).toBe(2);
    expect(m.activeTroop).toBe('giant');
    expect(m.troopStats('giant').hp).toBe(m.troopStats('giant', 2).hp);
    // Deploying spends the level's army, not the camps'.
    expect(m.deploy(1, 1)).toBe(true);
    expect(b.remaining.giant).toBe(12);
    expect(m.state.army).toEqual(home);
    // Loot and stars count as on any campaign village.
    m.discardRecording();
    for (const v of b.buildings) m.damage(v, v.hp);
    m.finishBattle();
    expect(b.result!.stars).toBe(3);
    expect(m.state.nativeCampaign!.stars[GIANT_SMASH]).toBe(3);
    expect(m.state.gold).toBeGreaterThan(0);
    expect(m.state.army).toEqual(home);
    expect(m.state.lastArmy).toEqual(last);
    expect(m.practiceStars).toBe(3);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });

  it('records a replay that validates, with the level’s army in its setup', () => {
    const m = village(4);
    m.startCampaign(GIANT_SMASH, false); // Without the guide (practice-guide.test.ts).
    m.deploy(1, 1);
    m.step(0.05);
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(replay.initial.fixedArmy).toBe(true);
    expect(held(replay.initial.army)).toEqual({ giant: 13, wallbreaker: 2, goblin: 11 });
    expect(validateReplay(replay)).toBe(true);
    // A fixed army belongs to a campaign village only.
    expect(validateReplay({ ...replay, initial: { ...replay.initial, practice: true } })).toBe(
      false,
    );
  });

  it('counts its stars toward the Starter Challenges’ Practice tasks', () => {
    const m = village(4);
    const task = STARTER_CHALLENGES.find((c) => c.type === 'GetTotalPracticeStars')!;
    expect(m.starterProgress(task)).toBe(0);
    m.state.nativeCampaign = freshNativeCampaign();
    m.state.nativeCampaign.stars[GIANT_SMASH] = 2;
    m.state.nativeCampaign.stars[GIANT_SMASH + 1] = 1;
    // Stars on the Goblin map's villages are not Practice stars.
    m.state.nativeCampaign.stars[0] = 3;
    expect(m.starterProgress(task)).toBe(3);
  });
});
