import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';

/** Source-backed auras from an actual Root Rider or a Champion wearing Electro Boots. */
export function defenderSpellRuleRecording(kind: 'rootrider' | 'electro-boots') {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [makeBuilding(1, 'townhall', 36, 36, 18)];
  model.state.nextId = 100;
  model.state.army = { ...emptyArmy(), giant: 1, rootrider: 2 };
  model.state.spells = { ...emptySpells(), freeze: 1 };
  model.state.spellLevels = { ...defaultSpellLevels(), freeze: 1 };
  model.state.king = undefined;
  model.startBattle(0, true);
  const recording = (model as unknown as { recording: ReplayData }).recording;
  const point = kind === 'rootrider' ? { x: 6, y: 5.5 } : { x: 9.4, y: 5 };
  recording.initial.defendingHeroes = [
    kind === 'rootrider'
      ? { kind: 'prince', level: 95, ...point }
      : { kind: 'king', level: 110, ...point },
  ];
  recording.initial.heroes =
    kind === 'rootrider'
      ? []
      : [{ kind: 'champion', level: 1, items: [{ slug: 'electro-boots', level: 1 }] }];
  model.battle = replayBattle(recording.initial);
  const battle = model.battle;
  const defender = battle.defenders!.find((defender) => defender.kind === 'hero')!;
  const until = (at: number) => {
    for (let remaining = 200; battle.elapsed < at - 1e-9; remaining--) {
      if (!remaining || battle.finished) throw Error('Defender spell checkpoint was not reached');
      model.step(0.05);
    }
  };
  model.activeSpell = 'freeze';
  if (!model.castSpell(point.x, point.y)) throw Error('Aura defender Freeze cast failed');
  until(1.6);
  if (kind === 'rootrider') {
    model.activeTroop = 'rootrider';
    if (!model.deploy(5, 5)) throw Error('Root Rider deployment failed');
  } else if (!model.deployNativeHero('champion', 5, 5)) throw Error('Champion deployment failed');
  until(1.65);
  const name = kind === 'rootrider' ? 'TreantWallDamageAura' : 'Electro Boots Aura';
  const aura = battle.nativeSpells!.find((spell) => spell.name === name);
  if (!aura) throw Error('Native aura did not begin on deployment');
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  until(aura.firstHit - 0.05);
  snapshot();
  const before = battle.elapsed;
  until(aura.firstHit + 0.05);
  snapshot();
  const hit = battle.elapsed;
  until(hit + 0.1);
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    before,
    hit,
    defenderId: defender.id,
    aura: name,
  };
}
