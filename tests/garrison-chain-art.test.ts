import { expect, it } from 'vitest';
import { loadCharacterArt } from '../src/game/character-art';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonChainEffects, garrisonLateEffectShapes } from '../src/game/garrison-late-effects';
import { GameModel } from '../src/game/model';
import { nativeEffectDuration, nativeEffectPoses } from '../src/game/native-effects';
import rawPack from '../public/assets/effects-native/electro-dragon-attack-chain/graph.json';
import type { NativeArtPack } from '../src/game/native-art-pack';

await loadCharacterArt();
const pack = rawPack as unknown as NativeArtPack;
const iso = (x: number, y: number) => ({ x: (x - y) * 32, y: (x + y) * 16 });

it('uses source lifetime and recorded ground/air chain attachments across seeks and death', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const dragon = spawnGarrisonDefender(battle, 'electrodragon', 3, 1, 10, 10, 0);
  dragon.attacks = [
    {
      at: 3,
      n: 0,
      x: 10,
      y: 10,
      targetId: 1,
      targetX: 12,
      targetY: 10,
      hitX: 12,
      hitY: 10,
      air: false,
      chain: [
        { targetId: 2, at: 3.128, fromX: 12, fromY: 10, x: 14, y: 10, air: true, damage: 896 },
        { targetId: 3, at: 3.256, fromX: 14, fromY: 10, x: 16, y: 10, air: false, damage: 716 },
      ],
    },
  ];
  const duration = nativeEffectDuration(pack, 'Electro Dragon Attack Chain');
  expect(duration).toBeCloseTo(0.401, 12);
  battle.elapsed = 3.2;
  const events = garrisonChainEffects(battle, iso, 46, battle.elapsed, duration);
  const fallback = garrisonLateEffectShapes(battle, true, iso, 46);
  expect(events).toHaveLength(2);
  events.forEach((event, i) => {
    const shape = fallback[i];
    expect(shape.kind).toBe('bolt');
    if (shape.kind !== 'bolt') throw Error('Expected chain bolt');
    expect(event.ground).toEqual(shape.points[0]);
    expect(event.target).toEqual(shape.points.at(-1));
    expect(nativeEffectPoses(pack, event, battle.elapsed, false).length).toBeGreaterThan(0);
    expect(nativeEffectPoses(pack, event, battle.elapsed, true).length).toBeGreaterThan(0);
  });
  battle.elapsed = 3.35;
  const later = garrisonChainEffects(battle, iso, 46, battle.elapsed, duration);
  expect(later).toHaveLength(3);
  expect(later[2].ground).toEqual({ x: iso(14, 10).x, y: iso(14, 10).y - 16 - 46 });
  expect(later[2].target).toEqual({ x: iso(16, 10).x, y: iso(16, 10).y - 16 });
  expect(garrisonLateEffectShapes(battle, true, iso, 46).some((s) => s.key === later[0].key)).toBe(
    false,
  );
  dragon.hp = 0;
  dragon.defeatedAt = 3.3;
  expect(garrisonChainEffects(battle, iso, 46, 3.35, duration)).toEqual(later);
  expect(garrisonChainEffects(battle, iso, 46, 4, duration)).toEqual([]);
  battle.elapsed = 3.2;
  expect(garrisonChainEffects(battle, iso, 46, 3.2, duration)).toEqual(events);
  expect(garrisonChainEffects(battle, iso, 46, 2.9, duration)).toEqual([]);
});
