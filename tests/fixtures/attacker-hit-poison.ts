import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import type { CombatProjectile } from '../../src/game/projectiles';

export type HitPoisonActor = 'headhunter' | 'lizard';

/** Actual attacks, followed by Recall; the Poison Lizard's final spit lands after its owner leaves. */
export function attackerHitPoisonRecording(
  kind: HitPoisonActor,
  air = false,
  version = REPLAY_VERSION,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.army = {
    ...emptyArmy(),
    giant: 1,
    ...(kind === 'headhunter' ? { headhunter: 2 } : {}),
  };
  model.state.troopLevels = { ...model.state.troopLevels, headhunter: 1 };
  model.state.spells = { ...emptySpells(), freeze: 1, recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  const target = { x: kind === 'headhunter' ? 7.5 : 10, y: 5 };
  recording.initial.defendingHeroes = [
    { kind: air ? 'prince' : 'king', level: air ? 95 : 110, ...target },
  ];
  recording.initial.heroes =
    kind === 'lizard'
      ? [{ kind: 'king', level: 1, items: [], pet: { kind: 'lizard', level: 1 } }]
      : [];
  model.battle = replayBattle(recording.initial, version);
  const battle = model.battle;
  const defender = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  const until = (at: number) => {
    for (let remaining = 400; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Attacker poison checkpoint was not reached');
      model.step(0.05);
    }
  };
  model.activeSpell = 'freeze';
  if (!model.castSpell(target.x, target.y)) throw Error('Poison target Freeze failed');
  until(1.6);
  if (kind === 'headhunter') {
    model.activeTroop = 'headhunter';
    if (!model.deploy(5, 5)) throw Error('Poison Headhunter deployment failed');
  } else if (!model.deployNativeHero('king', 5, 5))
    throw Error('Poison Lizard owner deployment failed');
  const actor = battle.units.find(
    (unit) => unit.kind === (kind === 'headhunter' ? 'headhunter' : 'poisonlizard'),
  )!;
  const shots: CombatProjectile[] = [];
  model.onEffect = (effect) => {
    if (effect.type !== 'projectile' || effect.sourceId !== actor.id) return;
    const shot = battle.projectiles!.find((shot) => shot.id === effect.projectileId)!;
    shots.push(JSON.parse(JSON.stringify(shot)));
  };
  model.activeSpell = 'recall';
  if (!model.castSpell(5, 5)) throw Error('Poison attacker Recall failed');
  const recallAt = battle.nativeSpells!.find((cast) => cast.name === 'Recall')!.firstHit;
  for (let remaining = 100; !shots.length; remaining--) {
    if (!remaining || battle.finished) throw Error('Poison attacker did not fire');
    model.step(0.05);
  }
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(shots[0].launched + 0.05);
  snapshot();
  const flight = battle.elapsed;
  until(shots[0].impact + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(2.65);
  snapshot();
  const recalled = battle.elapsed;
  if (battle.units.some((unit) => unit.id === actor.id))
    throw Error('Poison attacker was not recalled');
  until(4.15);
  snapshot();
  const green = battle.elapsed;
  const deadline = shots.at(-1)!.impact + 3;
  until(deadline + 0.1);
  snapshot();
  const expired = battle.elapsed;
  until(expired + 0.1);
  model.finishBattle();
  const dps = kind === 'headhunter' ? 11 : 80;
  const direct = shots.reduce((sum, shot) => sum + shot.damage, 0);
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    flight,
    hit,
    recalled,
    green,
    expired,
    deadline,
    shots,
    recallAt,
    actorId: actor.id,
    defenderId: defender.id,
    dps,
    direct,
    total: direct + dps * (deadline - shots[0].impact),
  };
}
