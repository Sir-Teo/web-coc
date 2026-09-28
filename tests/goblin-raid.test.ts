import { describe, expect, it } from 'vitest';
import { GameModel, GOBLIN_RAID_SIZE, BATTLE_SECONDS } from '../src/game/model';
import { validateReplay } from '../src/game/replay';
import { validateSave } from '../src/game/save';

describe('opening Goblin raid', () => {
  it('records goblins attacking this village without touching it', () => {
    const m = new GameModel();
    const before = JSON.stringify(m.state);
    const data = m.goblinRaidRecording()!;
    expect(JSON.stringify(m.state)).toBe(before);
    expect(validateReplay(data)).toBe(true);
    expect(data.initial.practice).toBe(true);
    expect(data.initial.army.goblin).toBe(GOBLIN_RAID_SIZE);
    const troops = data.actions.filter((a) => a.type === 'troop');
    expect(troops).toHaveLength(GOBLIN_RAID_SIZE);
    expect(troops.every((a) => a.type === 'troop' && a.kind === 'goblin')).toBe(true);
    // The recording stops when the raid does, within the three-minute limit.
    const seconds = data.steps.reduce((n, dt) => n + dt, 0);
    expect(seconds).toBeGreaterThan(3);
    expect(seconds).toBeLessThanOrEqual(BATTLE_SECONDS + 1);
    // The village's own buildings are the target.
    expect(data.initial.buildings.map((b) => b.id).sort()).toEqual(
      m.state.buildings.map((b) => b.id).sort(),
    );
  });

  it('plays as a replay and is marked seen on the way home', () => {
    const m = new GameModel();
    expect(m.watchGoblinRaid()).toBe(true);
    expect(m.goblinRaid).toBe(true);
    expect(m.replay).not.toBeNull();
    expect(m.state.raidLog ?? []).toHaveLength(0);
    m.returnHome();
    expect(m.goblinRaid).toBe(false);
    expect(m.state.goblinRaidSeen).toBe(true);
    expect(validateSave(JSON.parse(JSON.stringify(m.state)))).toBe(true);
  });
});
