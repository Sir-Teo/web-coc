import { heroPuppetBattle } from './hero-puppet';
import { emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';

/** Real King and Healer inputs against a live Cannon, preserving friendly group selection. */
export function healerBattle(level = 1, version = REPLAY_VERSION, x = 8) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.king = undefined;
  model.state.nextId = 1000;
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    makeBuilding(2, 'cannon', 1, 4, 21),
  ];
  model.state.army = { ...emptyArmy(), healer: 1, giant: 1 };
  model.state.troopLevels = { ...model.state.troopLevels, healer: level };
  model.state.spells = emptySpells();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.version = version;
  data.initial.heroes = [{ kind: 'king', level: 1, items: [] }];
  const battle = (model.battle = replayBattle(data.initial, version));
  if (!model.deployNativeHero('king', 6, 6.5)) throw Error('Healer King deployment failed');
  model.activeTroop = 'healer';
  if (!model.deploy(x, 6.5)) throw Error('Healer deployment failed');
  const healer = battle.units.at(-1)!,
    hero = battle.units.find((u) => u.hero)!,
    shots: { at: number; damage: number; impact: number; heroScale?: number }[] = [],
    seen = new Set<string>();
  const step = () => {
    if (battle.finished || battle.elapsed > 15) throw Error('Healer checkpoint expired');
    model.step(0.05);
    for (const p of battle.projectiles ?? [])
      if (p.sourceId === healer.id && p.weapon === 'healing' && !seen.has(p.id)) {
        seen.add(p.id);
        shots.push({
          at: p.launched!,
          impact: p.impact,
          damage: p.damage,
          heroScale: p.healingHeroScale,
        });
      }
  };
  const untilCasts = (n: number) => {
    while (shots.length < n) step();
  };
  return { model, battle, healer, hero, data, step, untilCasts, shots };
}

/** Input-only trained Healer recording, through the first two source flights. */
export function healerRecording(level = 1, version = REPLAY_VERSION, x = 8) {
  const r = healerBattle(level, version, x),
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const born = snapshot();
  while (!r.healer.attacking) r.step();
  const engaged = snapshot();
  r.untilCasts(1);
  const first = snapshot();
  while (r.battle.elapsed < r.shots[0].impact + 0.05 - 1e-9) r.step();
  const landed = snapshot();
  r.untilCasts(2);
  const second = snapshot();
  r.step();
  r.model.finishBattle();
  return {
    id: r.healer.id,
    heroId: r.hero.id,
    born,
    engaged,
    first,
    landed,
    second,
    shots: r.shots,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}

/** An actual Queen activation creates its fixed source-tier Healers without a carried Healer. */
export function healerPuppetRecording(item = 1, version = REPLAY_VERSION) {
  const r = heroPuppetBattle(
    { kind: 'queen', level: 30, items: [{ slug: 'healer-puppet', level: item }] },
    { healer: 1 },
    undefined,
    version,
  );
  if (!r.model.deployNativeHero('queen', 11.4, 11.5) || !r.model.activateNativeHeroAbility('queen'))
    throw Error('Healer Puppet inputs failed');
  const unit = r.battle.units.find((u) => u.kind === 'healer')!,
    seen = new Set<string>(),
    shots: { at: number; damage: number }[] = [],
    snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () => {
    if (snapshots.at(-1)?.at !== r.battle.elapsed)
      snapshots.push({ at: r.battle.elapsed, battle: JSON.parse(JSON.stringify(r.battle)) });
    return r.battle.elapsed;
  };
  const step = () => {
    if (r.battle.finished || r.battle.elapsed > 10) throw Error('Healer Puppet checkpoint expired');
    r.model.step(0.05);
    for (const p of r.battle.projectiles ?? [])
      if (p.weapon === 'healing' && p.sourceId === unit.id && !seen.has(p.id)) {
        seen.add(p.id);
        shots.push({ at: p.launched!, damage: p.damage });
      }
  };
  const born = snapshot();
  step();
  const pending = snapshot();
  while (!shots.length) step();
  const first = snapshot();
  while (shots.length < 2) step();
  const second = snapshot();
  step();
  r.model.finishBattle();
  return {
    id: unit.id,
    level: unit.level!,
    born,
    pending,
    first,
    second,
    shots,
    snapshots,
    data: JSON.parse(JSON.stringify(r.model.state.raidLog![0].replay!)) as ReplayData,
  };
}
