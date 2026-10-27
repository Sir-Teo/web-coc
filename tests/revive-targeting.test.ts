import { expect, it } from 'vitest';
import { GameModel, makeBuilding, type Battle } from '../src/game/model';
import { emptyArmy, emptySpells } from '../src/game/army';
import { replayBattle, validateReplay, type ReplayData } from '../src/game/replay';
import { makeReplayFile, parseReplayFile } from '../src/game/replay-file';
function arena() {
  const model = new GameModel();
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 1)];
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), revive: 2 };
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes = [
    { kind: 'king', level: 1, items: [] },
    { kind: 'queen', level: 1, items: [] },
  ];
  model.battle = replayBattle(data.initial);
  model.deployNativeHero('king', 5, 5);
  model.deployNativeHero('queen', 5, 5);
  const king = model.battle.units.find((u) => u.hero === 'king')!,
    queen = model.battle.units.find((u) => u.hero === 'queen')!;
  for (const u of [king, queen]) {
    u.hp = 0;
    u.defeatedAt = 0;
    u.spent = true;
  }
  return { model, data, king, queen };
}
it('direct Revive preserves the chosen Hero when fallen bodies overlap and rejects a second queued click', () => {
  const { model, data, king, queen } = arena();
  model.activeSpell = 'revive';
  expect(model.castReviveOnHero('queen')).toBe(true);
  expect(model.battle!.spells.revive).toBe(1);
  expect(model.castReviveOnHero('queen')).toBe(false);
  expect(model.battle!.spells.revive).toBe(1);
  expect(data.actions.at(-1)).toMatchObject({ type: 'spell', kind: 'revive', targetHero: 'queen' });
  for (let i = 0; i < 30; i++) model.step(0.05);
  expect(queen.hp).toBeGreaterThan(0);
  expect(king.hp).toBe(0);
});
it('ordinary tile Revive keeps nearest-target tie ordering', () => {
  const { model, king, queen } = arena();
  model.activeSpell = 'revive';
  expect(model.castSpell(5, 5)).toBe(true);
  for (let i = 0; i < 30; i++) model.step(0.05);
  expect(king.hp).toBeGreaterThan(0);
  expect(queen.hp).toBe(0);
});
it('quick Revive preserves the previous deployment selection and refuses living, ejected or Phoenix-pending Heroes', () => {
  const { model, queen } = arena();
  model.activeSpell = null;
  model.activeHeroKind = 'king';
  queen.ejected = true;
  expect(model.castReviveOnHero('queen')).toBe(false);
  delete queen.ejected;
  queen.hp = 1;
  expect(model.castReviveOnHero('queen')).toBe(false);
  queen.hp = 0;
  const roster = model.battle!.nativeHeroes!.find((hero) => hero.kind === 'queen')!;
  Object.assign(roster, { phoenix: { pending: true } });
  expect(model.castReviveOnHero('queen')).toBe(false);
  delete roster.phoenix;
  expect(model.castReviveOnHero('queen')).toBe(true);
  expect(model.activeHeroKind).toBe('king');
  expect(model.activeSpell).toBeNull();
});
it('portable direct-target actions retain only a valid Revive Hero and require version 123', () => {
  const { model, data } = arena();
  model.activeSpell = 'revive';
  expect(model.castReviveOnHero('queen')).toBe(true);
  model.step(0.05);
  model.finishBattle();
  const saved = model.state.raidLog![0].replay!,
    copied = parseReplayFile(JSON.stringify(makeReplayFile(saved)));
  expect(copied.actions.find((a) => a.type === 'spell')).toMatchObject({ targetHero: 'queen' });
  const old = structuredClone(saved);
  old.version = 122;
  expect(validateReplay(old)).toBe(false);
  for (const change of [
    { kind: 'freeze' },
    { targetHero: 'not-a-hero' },
    { targetHero: 'warden' },
  ]) {
    const bad = structuredClone(saved),
      action = bad.actions.find((a) => a.type === 'spell')!;
    Object.assign(action, change);
    expect(validateReplay(bad)).toBe(false);
  }
  expect(data.actions.some((a) => a.type === 'spell')).toBe(true);
});
it('actual Cannon knockout and direct Revive reconstruct through portable reverse seeks', async () => {
  const { reviveTargetingRecording } = await import('./fixtures/revive-targeting');
  const r = reviveTargetingRecording(),
    model = new GameModel();
  const knocked = r.snapshots.find((s) => s.at === r.knocked)!.battle as Battle;
  expect(knocked.units.find((u) => u.id === r.queenId)!.hp).toBeLessThanOrEqual(0);
  expect(model.openReplay(parseReplayFile(JSON.stringify(makeReplayFile(r.data))))).toBe(true);
  for (const snapshot of [...r.snapshots, ...r.snapshots.slice().reverse()]) {
    model.seekReplay(snapshot.at);
    while (model.replay!.seeking) model.step(0.05);
    expect(model.battle).toEqual(snapshot.battle);
  }
});
it('direct targeting resolves the roster body instead of a same-kind copy', () => {
  const { model, queen } = arena();
  model.battle!.units.unshift({ ...queen, id: 9999 });
  expect(model.castReviveOnHero('queen')).toBe(true);
  expect(model.battle!.nativeSpells!.find((c) => c.name === 'Revive')!.reviveTargetId).toBe(
    queen.id,
  );
});
