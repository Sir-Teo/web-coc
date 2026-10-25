import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

export function jumperChaseRecording(kind: 'lassi' | 'warden') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...Array.from({ length: 48 }, (_, y) => makeBuilding(100 + y, 'wall', 8, y, 18)),
  ];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1, goblin: 1 };
  model.state.spells = {
    ...emptySpells(),
    ...(kind === 'lassi' ? { freeze: 1 } : { invisibility: 1 }),
  };
  model.state.spellLevels = { ...defaultSpellLevels(), invisibility: 4 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.initial.defendingHeroes = [
    { kind: 'king', level: 110, x: kind === 'lassi' ? 9 : 16, y: 6.5 },
  ];
  recording.initial.heroes =
    kind === 'lassi'
      ? [{ kind: 'king', level: 1, items: [], pet: { kind: 'lassi', level: 1 } }]
      : [{ kind: 'warden', level: 1, items: [] }];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const defender = battle.defenders!.find((d) => d.kind === 'hero')!;
  const step = () => {
    if (battle.elapsed > 15 || battle.finished)
      throw Error('Wall-jumping defender checkpoint was not reached');
    model.step(0.05);
  };
  model.activeTroop = 'goblin';
  if (!model.deploy(kind === 'lassi' ? 14 : 5, 6.5))
    throw Error('Defender alert deployment failed');
  if (kind === 'lassi') {
    step();
    if (!defender.alerted) throw Error('Defender did not alert before Freeze');
    model.activeSpell = 'freeze';
    if (!model.castSpell(defender.x, defender.y)) throw Error('Defender Freeze failed');
    while ((defender.stunnedUntil ?? 0) <= battle.elapsed) step();
  } else {
    // A Warden acquires units only inside the shared 7-tile engagement radius.
    // Lure the defender close, acquire it, then hide its targets so it returns home.
    while (defender.x > 10) step();
  }
  if (!model.deployNativeHero(kind === 'lassi' ? 'king' : 'warden', 5, 6.5))
    throw Error('Wall-jumping Hero deployment failed');
  const hero = battle.nativeHeroes![0];
  const subjectId = kind === 'lassi' ? hero.petId! : hero.unitId!;
  const subject = battle.units.find((u) => u.id === subjectId)!;
  const attacks: { at: number; impact: number }[] = [];
  model.onEffect = (effect) => {
    if (effect.sourceId !== subjectId) return;
    if (kind === 'lassi' && effect.type === 'hit' && effect.targetDefender)
      attacks.push({ at: battle.elapsed, impact: battle.elapsed });
    if (kind === 'warden' && effect.type === 'projectile') {
      const p = battle.projectiles!.find((p) => p.id === effect.projectileId)!;
      if (p.targetDefender) attacks.push({ at: battle.elapsed, impact: p.impact });
    }
  };
  step();
  if (subject.defenderTarget !== defender.id)
    throw Error('The subject did not acquire the defending Hero');
  if (kind === 'warden') {
    model.activeSpell = 'invisibility';
    if (!model.castSpell(5.4, 6.5)) throw Error('Defender return-home Invisibility failed');
  }
  step();
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  snapshot();
  const before = battle.elapsed;
  if (kind === 'lassi') while (!attacks.length) step();
  else while (subject.x < 9 - 1e-9) step();
  step();
  snapshot();
  const crossed = battle.elapsed;
  let attack = attacks.at(-1)!;
  if (kind === 'warden') {
    while (!attacks.some((a) => a.at >= crossed - 1e-9)) step();
    attack = attacks.find((a) => a.at >= crossed - 1e-9)!;
  }
  while (battle.elapsed < attack.impact + 0.1 - 1e-9) step();
  snapshot();
  const hit = battle.elapsed;
  const damage = model.unitStats(subject).damage;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    subjectId,
    defenderId: defender.id,
    before,
    crossed,
    hit,
    damage,
  };
}
