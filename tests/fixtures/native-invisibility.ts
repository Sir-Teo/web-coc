import { defaultSpellLevels, emptyArmy, emptySpells } from '../../src/game/army';
import { GameModel, makeBuilding } from '../../src/game/model';
import { replayBattle, type ReplayData } from '../../src/game/replay';
import { spellEndTime } from '../../src/game/native-spells';
import type { CombatProjectile } from '../../src/game/projectiles';
import { defenderHidden } from '../../src/game/defender-visibility';

export type InvisibilityScenario = 'building' | 'defender' | 'tower';
/** Actual player inputs, or a Spell Tower triggered by a real Champion hit. */
export function nativeInvisibilityRecording(mode: InvisibilityScenario, air = false) {
  const model = new GameModel();
  model.state.obstacles = [];
  model.state.buildings = [
    makeBuilding(1, 'townhall', 36, 36, 18),
    ...(mode === 'building'
      ? [makeBuilding(2, 'cannon', 10, 5, 10), makeBuilding(3, 'goldstorage', 16, 5, 15)]
      : mode === 'tower'
        ? [
            makeBuilding(2, 'cannon', 8, 5, 21),
            { ...makeBuilding(3, 'spelltower', 10, 8, 3), spellMode: 'invisibility' as const },
          ]
        : []),
  ];
  model.state.nextId = 1000;
  model.state.king = undefined;
  model.state.army = { ...emptyArmy(), giant: 1, ...(mode === 'defender' ? { golem: 1 } : {}) };
  model.state.spells = {
    ...emptySpells(),
    invisibility: mode === 'tower' ? 0 : 1,
    freeze: mode === 'defender' ? 1 : 0,
  };
  model.state.spellLevels = defaultSpellLevels();
  model.startBattle(0, true);
  const data = (model as unknown as { recording: ReplayData }).recording;
  const kind = mode === 'tower' ? 'champion' : 'queen';
  data.initial.heroes = [{ kind, level: 1, items: [] }];
  if (mode !== 'building')
    data.initial.defendingHeroes = [
      {
        kind: mode === 'tower' ? 'warden' : air ? 'prince' : 'king',
        level: air ? 95 : 1,
        x: mode === 'tower' ? 11.5 : 9,
        y: 6.5,
      },
    ];
  model.battle = replayBattle(data.initial);
  const battle = model.battle;
  const defender = battle.defenders?.find((d) => d.kind === 'hero');
  const subject = mode === 'building' ? battle.buildings.find((b) => b.id === 2)! : defender!;
  const step = () => {
    if (battle.finished || battle.elapsed > 18)
      throw Error(`Invisibility ${mode} checkpoint was not reached at ${battle.elapsed}s`);
    model.step(0.05);
  };
  const until = (at: number) => {
    while (battle.elapsed < at - 1e-9) step();
  };
  if (mode === 'defender') {
    model.activeTroop = 'golem';
    if (!model.deploy(14, 6.5)) throw Error('Invisibility lure failed');
    step();
    model.activeSpell = 'freeze';
    if (!model.castSpell(9, 6.5)) throw Error('Invisibility enemy Freeze failed');
    while ((defender!.stunnedUntil ?? 0) <= battle.elapsed) step();
  }
  if (!model.deployNativeHero(kind, 5, 6.5)) throw Error('Invisibility Hero deployment failed');
  const unitId = battle.nativeHeroes![0].unitId!;
  const shots: CombatProjectile[] = [];
  const defenderHits: { at: number; hidden: boolean }[] = [];
  model.onEffect = (fx) => {
    if (fx.sourceId === unitId && fx.type === 'projectile') {
      const p = battle.projectiles!.find((p) => p.id === fx.projectileId)!;
      shots.push(JSON.parse(JSON.stringify(p)));
    }
    if (defender && fx.sourceId === defender.id && fx.type === 'hit')
      defenderHits.push({ at: battle.elapsed, hidden: defenderHidden(battle, defender) });
  };
  while (!shots.length) step();
  until(shots[0].launched + 0.1);
  if (mode !== 'tower') {
    model.activeSpell = 'invisibility';
    if (
      !model.castSpell(
        subject.x + (mode === 'building' ? 1.5 : 0),
        subject.y + (mode === 'building' ? 1.5 : 0),
      )
    )
      throw Error('Player Invisibility cast failed');
  }
  const spellName = mode === 'tower' ? 'Spell Tower Invisibility' : 'Invisibility';
  while (!battle.nativeSpells?.some((s) => s.name === spellName)) step();
  const spell = battle.nativeSpells!.find((s) => s.name === spellName)!;
  const firstHit = spell.firstHit;
  const deadline = spellEndTime(spell) + 0.6;
  const snapshots: { at: number; battle: unknown }[] = [];
  const snapshot = () =>
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  step();
  snapshot();
  const waiting = battle.elapsed;
  until(firstHit + 0.05);
  snapshot();
  const hidden = battle.elapsed;
  const pending =
    battle.projectiles?.filter(
      (p) => p.sourceId === unitId && p.targetId === subject.id && p.impact > battle.elapsed + 1e-9,
    ) ?? [];
  if (mode !== 'tower' && !pending.length)
    throw Error(
      `Invisibility ${mode} left no airborne arrow at ${battle.elapsed}s (target HP ${subject.hp})`,
    );
  const pendingDamage = pending.reduce((sum, p) => sum + p.damage, 0);
  until(Math.max(hidden + 0.1, ...pending.map((p) => p.impact + 0.05)));
  snapshot();
  const impacted = battle.elapsed;
  until(deadline + 0.1);
  snapshot();
  const expired = battle.elapsed;
  step();
  model.finishBattle();
  return {
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
    snapshots,
    mode,
    air,
    unitId,
    subjectId: subject.id,
    firstHit,
    waiting,
    hidden,
    impacted,
    expired,
    deadline,
    pendingDamage,
    shots,
    defenderHits,
  };
}
