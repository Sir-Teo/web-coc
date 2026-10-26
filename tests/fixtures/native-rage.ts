import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { spellEndTime } from '../../src/game/native-spells';

export type RageScenario = 'healing' | 'aura' | 'tower';
/** Real army deployments and player casts, or an automatically triggered Rage Spell Tower. */
export function nativeRageRecording(mode: RageScenario) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    mode === 'tower'
      ? { ...makeBuilding(2, 'spelltower', 10, 8, 1), spellMode: 'rage' as const }
      : makeBuilding(2, 'cannon', mode === 'aura' ? 14 : 10, 5, 21),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = {
    ...emptyArmy(),
    swordsman: 1,
    ...(mode === 'tower' ? { golem: 1 } : { giant: 1 }),
    ...(mode === 'healing' ? { healer: 1 } : {}),
  };
  model.state.troopLevels = { ...model.state.troopLevels, giant: 10, healer: 1 };
  model.state.spells = { ...emptySpells(), rage: mode === 'tower' ? 0 : 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial.heroes =
    mode === 'aura' ? [{ kind: 'warden', level: 1, items: [{ slug: 'rage-gem', level: 1 }] }] : [];
  if (mode === 'tower')
    data.initial.defendingHeroes = [{ kind: 'warden', level: 1, x: 11.5, y: 6.5 }];
  model.battle = replayBattle(data.initial);
  const battle = model.battle;
  if (mode === 'aura' && !model.deployNativeHero('warden', 4, 6.5))
    throw Error('Rage Gem deployment failed');
  model.activeTroop = mode === 'tower' ? 'golem' : 'giant';
  if (!model.deploy(5, 6.5)) throw Error('Rage subject deployment failed');
  const subject = battle.units.at(-1)!;
  let healerId: number | undefined;
  if (mode === 'healing') {
    model.activeTroop = 'healer';
    if (!model.deploy(4, 6.5)) throw Error('Rage Healer deployment failed');
    healerId = battle.units.at(-1)!.id;
  }
  const defender = battle.defenders?.find((d) => d.kind === 'hero');
  const heals: number[] = [];
  const hits: { at: number; damage: number }[] = [];
  let hp = subject.hp;
  model.onEffect = (fx) => {
    if (
      fx.sourceId === healerId &&
      healerId !== undefined &&
      (fx.type === 'hit' || fx.type === 'projectile')
    )
      heals.push(battle.elapsed);
    if (defender && fx.sourceId === defender.id && fx.type === 'hit') {
      hits.push({ at: battle.elapsed, damage: hp - subject.hp });
      hp = subject.hp;
    }
  };
  if (mode !== 'tower') {
    model.activeSpell = 'rage';
    if (!model.castSpell(mode === 'aura' ? 5 : 7, 6.5)) throw Error('Player Rage failed');
  }
  const step = () => {
    if (battle.finished || battle.elapsed > 30 || subject.hp <= 0)
      throw Error(`Rage ${mode} checkpoint was not reached at ${battle.elapsed}s`);
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const name = mode === 'tower' ? 'Spell Tower Rage' : 'Rage';
  while (!battle.nativeSpells?.some((s) => s.name === name)) step();
  const cast = battle.nativeSpells!.find((s) => s.name === name)!;
  const firstHit = cast.firstHit;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(firstHit - 0.05);
  snapshot();
  const before = battle.elapsed;
  until(firstHit + 0.1);
  snapshot();
  const boosted = battle.elapsed;
  let later: number;
  let expiry: number | undefined;
  if (mode === 'aura') {
    while (Math.hypot(subject.x - cast.x, subject.y - cast.y) <= 5 + 1e-9) step();
    expiry = subject.native!.effects!.boost!.sources![`spell:${cast.id}`].until;
    until(expiry + 0.1);
    snapshot();
    later = battle.elapsed;
  } else if (mode === 'healing') {
    while (heals.filter((at) => at > firstHit).length < 3) step();
    until(battle.elapsed + 0.5);
    snapshot();
    later = battle.elapsed;
  } else {
    while (!hits.some((h) => h.at > firstHit + 1e-9)) step();
    snapshot();
    later = battle.elapsed;
    expiry = spellEndTime(cast) + 1;
    until(expiry + 0.1);
    snapshot();
  }
  const expired = mode === 'tower' ? battle.elapsed : undefined;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    mode,
    subjectId: subject.id,
    defenderId: defender?.id,
    healerId,
    before,
    boosted,
    later,
    expired,
    expiry,
    firstHit,
    heals,
    hits,
  };
}
