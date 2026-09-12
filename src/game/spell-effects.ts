import { SPELLS, spellStatsAt } from './data';
import type { Aura, Battle } from './model';
import {
  HEAL_PULSES,
  RAGE_PULSES,
  SPELL_PULSE_INTERVAL,
  HEAL_HERO_MULTIPLIER,
  RAGE_LINGER,
} from './spell-progression';

/** Resolve each scheduled pulse exactly once, including pulses crossed by a long frame. */
export function stepSpellAuras(battle: Battle) {
  for (const aura of battle.auras) {
    const count = aura.kind === 'heal' ? HEAL_PULSES : RAGE_PULSES;
    const stats = spellStatsAt(aura.kind, battle.spellLevels?.[aura.kind] ?? 1);
    while (aura.pulses < count) {
      const at = aura.start + aura.pulses * SPELL_PULSE_INTERVAL;
      if (at >= aura.end || at > battle.elapsed + 1e-9) break;
      aura.pulses++;
      for (const unit of battle.units) {
        if (
          unit.hp <= 0 ||
          (unit.spawnedAt ?? 0) > at + 1e-9 ||
          Math.hypot(unit.x - aura.x, unit.y - aura.y) > stats.radius
        )
          continue;
        if (aura.kind === 'heal')
          unit.hp = Math.min(
            unit.maxHp,
            unit.hp + stats.heal * (unit.hero ? HEAL_HERO_MULTIPLIER : 1),
          );
        else if (aura.kind === 'rage')
          unit.spellRageUntil = Math.max(unit.spellRageUntil ?? 0, at + RAGE_LINGER);
      }
    }
  }
  battle.auras = battle.auras.filter((aura) => aura.end > battle.elapsed);
}

export function startSpellAura(battle: Battle, kind: 'heal' | 'rage', x: number, y: number): Aura {
  const aura = {
    kind,
    x,
    y,
    start: battle.elapsed,
    end: battle.elapsed + SPELLS[kind].duration,
    pulses: 0,
  };
  battle.auras.push(aura);
  stepSpellAuras(battle);
  return aura;
}
