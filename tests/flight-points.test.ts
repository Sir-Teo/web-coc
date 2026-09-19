import { expect, it } from 'vitest';
import { mortarFlightPoint, mortarProjectilePose } from '../src/game/mortar-poses';
import { bombFlightPoint, bombProjectilePose } from '../src/game/bomb-tower-poses';
import { wizardFlightPoint, wizardProjectilePose } from '../src/game/wizard-tower-poses';
import { goblinBombFlightPoint, goblinBombPose } from '../src/game/late-goblin-buildings-poses';
import { spellBottleFlightPoint, spellBottlePose } from '../src/game/spell-tower-poses';
import type { SpellTowerCast } from '../src/game/spell-tower';

const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });
const shot = { fromX: 10, fromY: 12, x: 18, y: 15, launched: 2, impact: 3.2, toAir: true };
const times = [1.9, 2, 2.37, 2.9, 3.2, 4];

it('trail flight points match the full projectile poses they replace', () => {
  for (const t of times) {
    const pick = (p: { x: number; y: number }) => [p.x, p.y];
    expect(pick(mortarFlightPoint(1, shot, t, iso))).toEqual(
      pick(mortarProjectilePose(1, shot, t, iso)),
    );
    expect(pick(bombFlightPoint(shot, t, iso))).toEqual(pick(bombProjectilePose(1, shot, t, iso)));
    expect(pick(wizardFlightPoint(1, shot, t, iso, 46))).toEqual(
      pick(wizardProjectilePose(1, shot, t, iso, 46)),
    );
    expect(pick(goblinBombFlightPoint(shot, t, iso))).toEqual(pick(goblinBombPose(shot, t, iso)));
    const cast = {
      index: 1,
      sourceId: 1,
      weapon: 'poison',
      level: 2,
      at: 2,
      deployAt: 2.8,
      fromX: 10,
      fromY: 12,
      x: 18,
      y: 15,
      targetId: null,
      onDeath: false,
      applied: 0,
    } as SpellTowerCast;
    expect(pick(spellBottleFlightPoint(cast, t, iso))).toEqual(pick(spellBottlePose(cast, t, iso)));
  }
});
