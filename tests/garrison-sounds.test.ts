import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import source from '../reference/garrison/sounds.json';
import native from '../reference/garrison/native.json';
import { GameModel } from '../src/game/model';
import { spawnGarrisonDefender } from '../src/game/garrison-combat';
import { garrisonSoundCues } from '../src/game/garrison-sounds';

it('ships all seven original Ogg files unchanged and binds the source character effects', () => {
  expect(Object.keys(source.sounds)).toHaveLength(7);
  for (const sound of Object.values(source.sounds)) {
    const bytes = readFileSync(`public/${sound.path}`);
    expect(bytes.length).toBe(sound.bytes);
    expect(bytes.subarray(0, 4).toString()).toBe('OggS');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(sound.sha256);
  }
  for (const [kind, name, level] of [
    ['dragon', 'Dragon', 7],
    ['balloon', 'Balloon', 8],
  ] as const) {
    const row = Object.assign({}, ...native.characters[name].slice(0, level));
    expect(source.bindings[kind]).toMatchObject({
      deploy: row.DeployEffect,
      attack: row.AttackEffect,
      hit: row.HitEffect,
      die: row.DieEffect,
    });
  }
  expect(source.bindings.balloon.deathDamage).toBe('Dark Balloon Exposion');
});

it('reconstructs unique pitch-stable cues and the delayed Balloon blast without changing combat state', () => {
  const model = new GameModel();
  model.startBattle(0, true);
  const battle = model.battle!;
  const dragon = spawnGarrisonDefender(battle, 'dragon', 7, 1, 10, 10, 0.3);
  const balloon = spawnGarrisonDefender(battle, 'balloon', 8, 1, 11, 10, 0.4);
  for (const defender of [dragon, balloon]) {
    defender.attacks.push({ at: 1, x: 10, y: 10, targetId: 1, targetX: 10, targetY: 10 });
    defender.hp = 0;
    defender.defeatedAt = 2;
  }
  const pending = garrisonSoundCues(battle);
  expect(pending.some((cue) => cue.key.includes('death-damage'))).toBe(false);
  balloon.deathResolved = true;
  const before = structuredClone(battle);
  const cues = garrisonSoundCues(battle);
  expect(cues).toHaveLength(8);
  expect(new Set(cues.map((c) => c.key)).size).toBe(cues.length);
  expect(cues.find((c) => c.key.includes('death-damage'))).toMatchObject({
    at: 2.416,
    volume: 0.6,
  });
  expect(cues.find((c) => c.key.includes('death-damage'))!.pitch).toBeGreaterThanOrEqual(0.75);
  expect(cues.find((c) => c.key.includes('death-damage'))!.pitch).toBeLessThanOrEqual(0.85);
  expect(cues.filter((c) => c.key.startsWith(`garrison:${dragon.id}:hit`))).toEqual([]);
  expect(garrisonSoundCues(JSON.parse(JSON.stringify(battle)))).toEqual(cues);
  expect(battle).toEqual(before);
});
