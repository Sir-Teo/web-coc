import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import type { HeroKind } from '../../src/game/native-hero-data';

export const REGENERATING_ITEMS = [
  { kind: 'king', slug: 'giant-gauntlet', max: 27, first: 6, last: 40 },
  { kind: 'queen', slug: 'healer-puppet', max: 18, first: 6, last: 35 },
  { kind: 'queen', slug: 'action-figure', max: 27, first: 6, last: 40 },
  { kind: 'champion', slug: 'electro-boots', max: 27, first: 6, last: 45 },
  { kind: 'duke', slug: 'fire-heart', max: 18, first: 50, last: 150 },
] as const;
export type RegenerationItem = (typeof REGENERATING_ITEMS)[number]['slug'];

export function heroRegenerationBattle(
  slug: RegenerationItem,
  level = 1,
  version = REPLAY_VERSION,
  armed = false,
) {
  const def = REGENERATING_ITEMS.find((item) => item.slug === slug)!;
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(armed ? [makeBuilding(2, 'monolith', 13, 10, 1)] : []),
  ];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1 };
  model.state.spells = { ...emptySpells(), recall: 1 };
  model.state.spellLevels = defaultSpellLevels();
  model.state.king = undefined;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: def.kind as HeroKind, level: 1, items: [{ slug, level }] }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero(def.kind, 6.9, 11.5))
    throw Error('Regeneration Hero deployment failed');
  const hero = battle.nativeHeroes![0],
    unit = battle.units.find((u) => u.id === hero.unitId)!;
  return { model, battle, data, hero, unit, kind: def.kind };
}

/** A source Monolith wounds the Hero; six seconds in Recall cannot bank self-healing ticks. */
export function heroRegenerationRecallRecording(slug: RegenerationItem, version = REPLAY_VERSION) {
  const r = heroRegenerationBattle(slug, 1, version, true);
  const { model, battle, hero, unit } = r;
  const step = () => {
    if (battle.finished || battle.elapsed > 40)
      throw Error('Regeneration Recall checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  while (unit.hp >= unit.maxHp - 1e-9) step();
  if (unit.hp <= 0) throw Error('Monolith defeated the Hero before Recall');
  model.activeSpell = 'recall';
  if (!model.castSpell(unit.x, unit.y)) throw Error('Regeneration Recall failed');
  while (hero.unitId !== null) step();
  const recalled = snapshot(),
    recalledHp = hero.recalledHp!,
    oldId = unit.id;
  until(battle.elapsed + 6);
  const held = snapshot();
  step();
  model.activeSpell = null;
  if (!model.deployNativeHero(r.kind, 5, 28)) throw Error('Regeneration redeployment failed');
  const unitId = hero.unitId!,
    spawnedAt = battle.elapsed;
  const times = {
    afterDeploy: spawnedAt + 0.05,
    beforeTick: spawnedAt + 0.95,
    firstTick: spawnedAt + 1.05,
    later: spawnedAt + 1.2,
  };
  for (const key of Object.keys(times) as (keyof typeof times)[]) {
    until(times[key]);
    times[key] = snapshot();
  }
  step();
  model.finishBattle();
  return {
    slug,
    kind: r.kind,
    oldId,
    unitId,
    recalledHp,
    recalled,
    held,
    spawnedAt,
    ...times,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
