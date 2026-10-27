import { emptySpells } from '../../src/game/army';
import { GameModel } from '../../src/game/model';
import type { GarrisonDefender } from '../../src/game/defenders';
import { REPLAY_VERSION, replayBattle, type ReplayData } from '../../src/game/replay';
import { garrisonAudioRecording } from './garrison-audio';

/** Trap-only setup: actual Tome or Snake Bracelet inputs must use the shared damage rules. */
export function ghostDefenseRecording(mode: 'tome' | 'snake' = 'tome', version = REPLAY_VERSION) {
  const setup = structuredClone(garrisonAudioRecording('royalghost', version).data.initial),
    model = new GameModel();
  setup.spells = emptySpells();
  setup.heroes =
    mode === 'tome'
      ? [{ kind: 'warden', level: 1, items: [{ slug: 'eternal-tome', level: 1 }] }]
      : [{ kind: 'king', level: 95, items: [{ slug: 'snake-bracelet', level: 1 }] }];
  model.state.king = undefined;
  model.state.obstacles = [];
  model.state.buildings = structuredClone(setup.buildings);
  model.state.army = { ...setup.army };
  model.state.spells = { ...setup.spells };
  model.state.troopLevels = { ...setup.troopLevels };
  model.state.spellLevels = { ...setup.spellLevels };
  model.state.nextId = setup.nextId;
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  data.initial = setup;
  data.version = version;
  const battle = (model.battle = replayBattle(setup, version)),
    snapshots: { at: number; battle: unknown }[] = [];
  const step = () => {
    if (battle.finished || battle.elapsed > 20) throw Error('Ghost defense checkpoint missing');
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  const snapshot = () => {
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
    return battle.elapsed;
  };
  const kind = mode === 'tome' ? 'warden' : 'king';
  if (!model.deployNativeHero(kind, 9, 10.5)) throw Error('Ghost defense Hero failed');
  const heroId = battle.nativeHeroes![0].unitId!,
    hero = battle.units.find((u) => u.id === heroId)!;
  let allyId: number | undefined;
  if (mode === 'tome') {
    model.activeHero = false;
    model.activeHeroKind = null;
    model.activeTroop = 'giant';
    if (!model.deploy(9, 11.5)) throw Error('Ghost defense ally failed');
    allyId = battle.units.at(-1)!.id;
  }
  while (!battle.defenders?.some((d) => d.kind === 'royalghost' && d.attacking)) step();
  const ghost = battle.defenders!.find((d) => d.kind === 'royalghost')! as GarrisonDefender,
    abilityAt = battle.elapsed;
  if (mode === 'tome' && !model.activateNativeHeroAbility('warden'))
    throw Error('Ghost defense Tome failed');
  until(abilityAt + 0.1);
  const primed = snapshot();
  while (!ghost.attacks.length) step();
  step();
  const first = snapshot();
  until(battle.elapsed + 0.1);
  const spawned = snapshot();
  let protectedAt: number | undefined, expired: number | undefined;
  if (mode === 'tome') {
    until(abilityAt + 2.7);
    protectedAt = snapshot();
    until(abilityAt + 5.5);
    expired = snapshot();
  }
  step();
  model.finishBattle();
  return {
    mode,
    heroId,
    allyId,
    ghostId: ghost.id,
    abilityAt,
    primed,
    first,
    spawned,
    protectedAt,
    expired,
    heroMaxHp: hero.maxHp,
    snapshots,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
