import { describe, expect, it } from 'vitest';
import { GameModel, BATTLE_SECONDS } from '../src/game/model';
import {
  ladderOffer,
  ladderOpponent,
  ladderTrophies,
  LADDER_SPREAD,
  validLadderMatch,
} from '../src/game/ladder';
import { NATIVE_CAMPAIGN, nativeCampaignIssues } from '../src/game/native-campaign';
import { validateSave } from '../src/game/save';
import { replayBattle, validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

describe('ladder offers', () => {
  it('stakes more against stronger opponents and less against weaker ones', () => {
    expect(ladderOffer(1000, 1000)).toEqual({ opponent: 1000, win: 30, loss: 20 });
    const stronger = ladderOffer(1000, 1100),
      weaker = ladderOffer(1000, 900);
    expect(stronger.win).toBeGreaterThan(30);
    expect(stronger.loss).toBeLessThan(20);
    expect(weaker.win).toBeLessThan(30);
    expect(weaker.loss).toBeGreaterThan(20);
    // Extreme gaps stay inside the stake limits.
    expect(ladderOffer(0, 100_000)).toMatchObject({ win: 59, loss: 1 });
    expect(ladderOffer(100_000, 0)).toMatchObject({ win: 1, loss: 39 });
  });

  it('pays thirds of the win by stars and takes the stake with none', () => {
    const match = { opponent: 1000, win: 30, loss: 20 };
    expect([0, 1, 2, 3].map((stars) => ladderTrophies(match, stars))).toEqual([-20, 10, 20, 30]);
  });

  it('picks a playable native layout near the Town Hall, the same one for the same seed', () => {
    for (const townhall of [2, 5, 9, 13, 18]) {
      for (let seed = 0; seed < 40; seed++) {
        const { index, match } = ladderOpponent(seed, townhall, 1248);
        const stage = NATIVE_CAMPAIGN[index];
        expect(stage.family ?? 'goblin').not.toBe('forged');
        expect(nativeCampaignIssues(index)).toEqual([]);
        expect(Math.abs(match.opponent - 1248)).toBeLessThanOrEqual(LADDER_SPREAD);
        expect(validLadderMatch(match)).toBe(true);
        expect(ladderOpponent(seed, townhall, 1248)).toEqual({ index, match });
        if (townhall <= 15)
          expect(Math.abs(stage.recommendedTownHall! - townhall)).toBeLessThanOrEqual(2);
      }
    }
    // Opponents vary from match to match.
    const picks = new Set(Array.from({ length: 20 }, (_, s) => ladderOpponent(s, 9, 1248).index));
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('ladder matches', () => {
  it('starts a timed, loot-free match and moves trophies without touching the campaign', () => {
    const m = new GameModel();
    const { index, match } = m.ladderPreview;
    const trophies = m.state.trophies,
      gold = m.state.gold;
    m.startLadder();
    const b = m.battle!;
    expect(b).toMatchObject({ index, catalog: 'goblin-v1', practice: false, ladder: match });
    expect(b.prep).toBe(30);
    expect(Object.values(b.availableLoot!).every((v) => v === 0)).toBe(true);
    expect(m.state.ladderSeed).toBe(1);
    m.finishBattle();
    expect(b.result).toMatchObject({ gold: 0, elixir: 0, stars: 0, trophies: -match.loss });
    expect(m.state.trophies).toBe(trophies - match.loss);
    expect(m.state.gold).toBe(gold);
    expect(m.state.nativeCampaign).toBeUndefined();
    const record = m.state.raidLog![0];
    expect(record.ladder).toEqual(match);
    expect(record.result.trophies).toBe(-match.loss);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    // The next match is against a new opponent.
    m.returnHome();
    expect(m.ladderPreview).not.toEqual({ index, match });
  });

  it('awards the win for stars and never takes trophies below zero', () => {
    const m = new GameModel();
    m.startLadder();
    const match = m.battle!.ladder!;
    const before = m.state.trophies;
    m.discardRecording();
    for (const v of m.battle!.buildings) m.damage(v, v.hp);
    m.finishBattle();
    expect(m.battle!.result!.stars).toBe(3);
    expect(m.state.trophies).toBe(before + match.win);
    expect(m.state.starBonus!.stars).toBe(3);
    m.returnHome();
    m.state.trophies = 3;
    m.startLadder();
    m.finishBattle();
    expect(m.state.trophies).toBe(0);
  });

  it('ends at the three-minute deadline after thirty seconds of scouting', () => {
    const m = new GameModel();
    m.startLadder();
    const b = m.battle!;
    m.step(30);
    expect(b.started).toBe(true);
    for (let t = 0; t < BATTLE_SECONDS + 1 && !b.finished; t += 0.5) m.step(0.5);
    expect(b.finished).toBe(true);
    expect(b.elapsed).toBe(BATTLE_SECONDS);
  });

  it('records a replay that carries the match and survives export', () => {
    const m = new GameModel();
    m.startLadder();
    m.finishBattle();
    const replay = m.state.raidLog![0].replay!;
    expect(validateReplay(replay)).toBe(true);
    expect(replay.initial.ladder).toEqual(m.state.raidLog![0].ladder);
    expect(replayBattle(replay.initial, replay.version)).toMatchObject({
      ladder: replay.initial.ladder,
      prep: 30,
    });
    const file = parseReplayFile(JSON.stringify(makeReplayFile(replay)));
    expect(file.initial.ladder).toEqual(replay.initial.ladder);
    // A ladder match never carries loot or runs as practice.
    const looted = structuredClone(replay);
    looted.initial.availableLoot!.gold = 1;
    expect(validateReplay(looted)).toBe(false);
    const practice = structuredClone(replay);
    practice.initial.practice = true;
    expect(validateReplay(practice)).toBe(false);
  });

  it('records valid loot-free matches against Dark Elixir villages at every Town Hall', () => {
    let darkVillages = 0;
    for (let townhall = 2; townhall <= 18; townhall++) {
      const m = new GameModel();
      m.townhall!.level = townhall;
      for (let match = 0; match < 3; match++) {
        m.startLadder();
        const b = m.battle!;
        const dark = NATIVE_CAMPAIGN[b.index].darkElixir > 0;
        expect(b.availableLoot!.dark === 0).toBe(dark);
        if (dark) darkVillages++;
        m.finishBattle();
        expect(validateReplay(m.state.raidLog![0].replay)).toBe(true);
        m.returnHome();
      }
      expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
    }
    expect(darkVillages).toBeGreaterThan(0);
  });

  it('rejects saves with an impossible trophy result or ladder seed', () => {
    const m = new GameModel();
    m.startLadder();
    m.finishBattle();
    const saved = JSON.parse(JSON.stringify(m.state));
    saved.raidLog[0].result.trophies = -saved.raidLog[0].ladder.loss - 1;
    expect(validateSave(saved)).toBe(false);
    const seed = JSON.parse(JSON.stringify(m.state));
    seed.ladderSeed = -1;
    expect(validateSave(seed)).toBe(false);
  });
});
