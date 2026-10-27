import { prepareReviveTargeting } from './revive-targeting';
import type { ReplayData } from '../../src/game/replay';
/** An actual Queen knockout is revived from a different tile, retaining both source origins. */
export function nativeReviveCastRecording(level = 1, direct = false) {
  const { model, battle, queenId } = prepareReviveTargeting(undefined, level, 1),
    queen = battle.units.find((u) => u.id === queenId)!,
    anchor = { x: queen.x, y: queen.y },
    caster = { x: queen.x + 3, y: queen.y };
  model.step(0.05);
  model.activeSpell = 'revive';
  if (!(direct ? model.castReviveOnHero('queen') : model.castSpell(caster.x, caster.y)))
    throw Error('Revive cast fixture failed');
  const cast = battle.nativeSpells!.find((c) => c.name === 'Revive')!,
    end = cast.firstHit,
    times = {
      bottle: cast.castAt + 0.4,
      beforeHit: end - 0.05,
      landing: end + 0.15,
      pulsing: end + 0.3,
      steady: end + 1,
      nearEnd: end + 2.5,
      beforeEnd: end - 0.05,
      end,
      afterLive: end + 0.15,
      fieldAfter: end + 3.1,
    },
    snapshots: { at: number; battle: unknown }[] = [];
  for (const key of (Object.keys(times) as (keyof typeof times)[]).sort(
    (a, b) => times[a] - times[b],
  )) {
    while (battle.elapsed < times[key] - 1e-9) {
      if (battle.finished) throw Error('Revive cast checkpoint failed');
      model.step(0.05);
    }
    times[key] = battle.elapsed;
    snapshots.push({ at: battle.elapsed, battle: JSON.parse(JSON.stringify(battle)) });
  }
  model.step(0.05);
  model.finishBattle();
  return {
    name: 'Revive' as const,
    key: 'revive' as const,
    level,
    ...times,
    snapshots,
    anchor,
    caster: { x: cast.x, y: cast.y },
    queenId,
    castId: cast.id,
    castAt: cast.castAt,
    resolvedAt: cast.firstHit,
    data: JSON.parse(JSON.stringify(model.state.raidLog![0].replay!)) as ReplayData,
  };
}
