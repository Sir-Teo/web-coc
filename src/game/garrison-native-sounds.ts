import source from '../../reference/troop-sounds/sounds.json' with { type: 'json' };
import { isGarrisonDefender, type GarrisonDefender } from './defenders';
import {
  garrisonSecondaryLevel,
  garrisonStats,
  garrisonSummonLevel,
  spawnedGarrisonKind,
  type GarrisonKind,
} from './garrison-kinds';
import type { Battle } from './model';
import { cueAudible, type SampleCue } from './sample-audio';
import { effectCue } from './troop-sounds';

type Event = 'deploy' | 'attack' | 'hit' | 'die' | 'chain';
type Binding = { name: string; row: number } & Partial<Record<Event, string>>;
const bindings = source.garrisons as Record<string, Record<string, Binding>>;
const EVENTS: readonly Event[] = ['deploy', 'attack', 'hit', 'die', 'chain'];
const legacy = (kind: GarrisonKind) => kind === 'dragon' || kind === 'balloon';

export const garrisonSoundEffect = (kind: GarrisonKind, level: number, event: Event) =>
  bindings[kind]?.[level]?.[event];

/** Original later-defender samples follow captured spawn, launch, impact, chain and death clocks. */
export function nativeGarrisonSoundCues(battle: Battle, defender: GarrisonDefender): SampleCue[] {
  const cues: SampleCue[] = [];
  if (!battle.nativeGarrisonSounds || legacy(defender.kind)) return cues;
  const binding = bindings[defender.kind]?.[defender.level];
  if (!binding) return cues;
  const key = `garrison:${defender.id}`,
    elapsed = battle.elapsed;
  const push = (event: Event, suffix: string, at: number) => {
    const effect = binding[event];
    if (!effect || at > elapsed + 1e-9 || !cueAudible(at, elapsed)) return;
    const cue = effectCue(effect, `${key}:${suffix}`, at);
    if (cue && cue.at <= elapsed + 1e-9 && cueAudible(cue.at, elapsed)) cues.push(cue);
  };
  push('deploy', 'deploy', defender.spawnedAt);
  for (const [index, attack] of defender.attacks.entries()) {
    const ordinal = attack.n ?? index;
    push('attack', `attack:${ordinal}`, attack.at);
    if (attack.hitAt !== undefined && attack.hit) push('hit', `hit:${ordinal}`, attack.hitAt);
    for (const [jumpIndex, jump] of (attack.chain ?? []).entries()) {
      push('chain', `chain:${ordinal}:${jumpIndex}`, jump.at);
      push('hit', `chain-hit:${ordinal}:${jumpIndex}`, jump.at);
    }
  }
  if (defender.defeatedAt !== undefined) push('die', 'die', defender.defeatedAt);
  return cues;
}

/** Warm the reserve and its source children before they arrive, plus trap-born or live defenders. */
export function garrisonSoundEffects(battle: Battle): Set<string> {
  const effects = new Set<string>(),
    seen = new Set<string>();
  if (!battle.nativeGarrisonSounds) return effects;
  const collect = (kind: GarrisonKind, level: number) => {
    const key = `${kind}:${level}`;
    if (legacy(kind) || seen.has(key)) return;
    seen.add(key);
    const binding = bindings[kind]?.[level];
    if (!binding) return;
    for (const event of EVENTS) if (binding[event]) effects.add(binding[event]!);
    const stats = garrisonStats(kind, level);
    if (stats.secondary) {
      const child = spawnedGarrisonKind(stats.secondary.character),
        childLevel = garrisonSecondaryLevel(stats);
      if (child && childLevel !== undefined) collect(child, childLevel);
    }
    if (stats.summon) {
      const child = spawnedGarrisonKind(stats.summon.character),
        childLevel = garrisonSummonLevel(stats);
      if (child && childLevel !== undefined) collect(child, childLevel);
    }
  };
  for (const reserve of battle.garrisons ?? [])
    for (const troop of reserve.troops) collect(troop.kind, troop.level);
  for (const defender of battle.defenders ?? [])
    if (isGarrisonDefender(defender)) collect(defender.kind, defender.level);
  if (battle.buildings.some((building) => building.npc === 'ghost-trap')) collect('royalghost', 7);
  return effects;
}
