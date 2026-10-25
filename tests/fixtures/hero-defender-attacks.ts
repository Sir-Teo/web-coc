import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, REPLAY_VERSION, type ReplayData } from '../../src/game/replay';
import type { HeroKind } from '../../src/game/native-hero-data';
import type { HeroItemSetup } from '../../src/game/native-heroes';
import type { CombatProjectile } from '../../src/game/projectiles';

export function heroDefenderBattle(
  kind: HeroKind,
  level = 1,
  items: HeroItemSetup[] = [],
  version = REPLAY_VERSION,
  air = false,
) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 1000;
  model.state.army = { ...emptyArmy(), giant: 1, goblin: 1, ...(air ? { golem: 1 } : {}) };
  model.state.spells = { ...emptySpells(), freeze: 1, recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  recording.version = version;
  recording.initial.heroes = [{ kind, level, items }];
  recording.initial.defendingHeroes = [
    { kind: air ? 'prince' : 'king', level: air ? 95 : 110, x: 9, y: 6.5 },
  ];
  model.battle = replayBattle(recording.initial, version);
  return { model, battle: model.battle, recording };
}

export function heroDefenderRecording(
  kind: 'queen' | 'warden' | 'duke',
  recall = false,
  items: HeroItemSetup[] = [],
  air = false,
) {
  const { model, battle } = heroDefenderBattle(kind, 1, items, undefined, air);
  const enemy = battle.defenders!.find((d) => d.kind === 'hero')!;
  const step = () => {
    if (battle.elapsed > 12 || battle.finished)
      throw Error(`Hero defender attack checkpoint was not reached at ${battle.elapsed}s`);
    model.step(0.05);
  };
  // The high-level Prince can kill a Goblin before Freeze lands; a Golem holds that lure.
  model.activeTroop = air ? 'golem' : 'goblin';
  if (!model.deploy(14, 6.5)) throw Error('Hero attack alert deployment failed');
  step();
  model.activeSpell = 'freeze';
  if (!model.castSpell(enemy.x, enemy.y)) throw Error('Hero attack Freeze failed');
  while ((enemy.stunnedUntil ?? 0) <= battle.elapsed) step();
  if (!model.deployNativeHero(kind, 5, 6.5)) throw Error('Hero attack deployment failed');
  const hero = battle.nativeHeroes![0];
  const unit = battle.units.find((u) => u.id === hero.unitId)!;
  const shots: CombatProjectile[] = [];
  const hits: number[] = [];
  model.onEffect = (effect) => {
    if (effect.sourceId !== unit.id) return;
    if (effect.type === 'projectile')
      shots.push(
        JSON.parse(JSON.stringify(battle.projectiles!.find((p) => p.id === effect.projectileId)!)),
      );
    if (effect.type === 'hit' && effect.targetDefender) hits.push(battle.elapsed);
  };
  while (!(kind === 'queen' ? shots.length : hits.length)) step();
  const first = kind === 'queen' ? shots[0].launched : hits[0];
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  while (battle.elapsed < first + 0.05 - 1e-9) step();
  snapshot();
  const active = battle.elapsed;
  let recalled: number | undefined;
  if (recall) {
    while (battle.elapsed < first + 0.1 - 1e-9) step();
    model.activeSpell = 'recall';
    if (!model.castSpell(unit.x, unit.y)) throw Error('Hero arrow Recall failed');
    while (hero.unitId !== null) step();
    if (
      !battle.projectiles?.some((p) => p.sourceId === unit.id && p.impact > battle.elapsed + 1e-9)
    )
      throw Error('Recall did not leave a native arrow airborne');
    snapshot();
    recalled = battle.elapsed;
  }
  const impact = recall
    ? Math.max(...battle.projectiles!.filter((p) => p.sourceId === unit.id).map((p) => p.impact))
    : kind === 'queen'
      ? shots[0].impact
      : first;
  while (battle.elapsed < impact + 0.1 - 1e-9) step();
  snapshot();
  const hit = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    active,
    recalled,
    hit,
    unitId: unit.id,
    enemyId: enemy.id,
    shots,
    hits,
  };
}
