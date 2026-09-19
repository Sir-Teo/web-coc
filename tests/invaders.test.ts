import { expect, it } from 'vitest';
import { invadersBattle, invadersVillage } from './fixtures/invaders-battle';
import { GameModel } from '../src/game/model';
import { validateSave } from '../src/game/save';
import { validateReplay } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';

it('settles Invaders source loot once and retains the complete 272-entity map through portable replay', () => {
  const village = invadersVillage();
  expect(validateSave(village)).toBe(true);
  const m = invadersBattle();
  const before = m.state.nativeCampaign!;
  const otherStars = before.stars.slice(0, 50),
    otherLoot = structuredClone(before.remaining.slice(0, 50));
  const towers = m.battle!.buildings.filter((b) => b.kind === 'bombtower');
  expect(towers).toHaveLength(1);
  for (let i = 0; i < 1600 && !m.battle!.finished; i++) m.step(0.05);
  expect(m.battle!.finished).toBe(true);
  // 65% before version 54 capped crowd separation.
  expect(m.battle!.result).toMatchObject({ stars: 2, destruction: 60, trophies: 0 });
  expect(m.battle!.deathBombs![towers[0].id]).toMatchObject({ damage: 220, resolved: true });
  const progress = m.state.nativeCampaign!;
  expect(progress.stars[50]).toBe(2);
  expect(progress.stars.slice(0, 50)).toEqual(otherStars);
  expect(progress.remaining.slice(0, 50)).toEqual(otherLoot);
  for (const resource of ['gold', 'elixir', 'dark'] as const) {
    const initial = resource === 'dark' ? 2000 : 300000;
    const reward = m.battle!.result![resource] ?? 0;
    const lost = m.battle!.result!.lostLoot?.[resource] ?? 0;
    expect(progress.remaining[50][resource] + reward + lost).toBe(initial);
  }
  const result = structuredClone(m.battle!.result),
    settled = JSON.stringify(m.state);
  m.finishBattle();
  expect(JSON.stringify(m.state)).toBe(settled);
  const file = makeReplayFile(m.state.raidLog![0].replay!);
  const parsed = parseReplayFile(JSON.stringify(file));
  expect(validateReplay(parsed)).toBe(true);
  expect(parsed.initial.buildings).toHaveLength(272);
  expect(parsed.initial.buildings.find((b) => b.kind === 'bombtower')).toMatchObject({
    level: 3,
    hp: 750,
  });
  m.returnHome();
  expect(validateSave(m.state)).toBe(true);
  const restored = new GameModel(JSON.parse(JSON.stringify(m.state)));
  const home = JSON.stringify(restored.state);
  expect(restored.openReplay(parsed)).toBe(true);
  restored.seekReplay(9999);
  while (restored.replay!.seeking) restored.step(0.05);
  expect(restored.battle!.result).toEqual(result);
  restored.returnHome();
  expect(JSON.stringify(restored.state)).toBe(home);
});
