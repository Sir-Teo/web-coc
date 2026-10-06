import source from '../../reference/troop-sounds/sounds.json' with { type: 'json' };
import type { Battle, Unit } from './model';
import { cueAudible, type SampleCue } from './sample-audio';
import { unitLevel } from './native-troops';

/**
 * The attacking troops' own deploy, attack and death sounds and the client's Building Destroyed
 * sound (reference/troop-sounds, imported by scripts/import-native-troop-sounds.py). Each effect
 * lists alternative takes; one is chosen per event from the event's key, so a replay picks the
 * same take. See docs/TROOP-SOUNDS.md.
 */
export type TroopSoundEvent = 'deploy' | 'attack' | 'die';
type Take = { sound: string; volume: number; minPitch: number; maxPitch: number; delay: number };
const TROOPS = source.troops as Record<
  string,
  { name: string } & Partial<Record<TroopSoundEvent, string | (string | null)[]>>
>;
const EFFECTS = source.effects as Record<string, Take[]>;
export const TROOP_SOUNDS = source.sounds;
export const DESTROYED_EFFECT = source.destroyed;
export const troopSample = (path: string) => `troop-${path.split('/').at(-1)}`;
/** A battle-clock jump larger than this (seconds) is a seek, not a frame. */
const SEEK_GAP = 1;

/** The effect a troop plays for an event at its level, if it has one. */
export function troopSoundEffect(kind: string, level: number, event: TroopSoundEvent) {
  const named = TROOPS[kind]?.[event];
  if (!named) return undefined;
  if (typeof named === 'string') return named;
  return named[Math.max(0, Math.min(named.length, Math.floor(level)) - 1)] ?? undefined;
}
/** Every sound file a troop kind can play, at any level. */
export function troopSoundFiles(kind: string) {
  const troop = TROOPS[kind];
  if (!troop) return [];
  const names = (['deploy', 'attack', 'die'] as const).flatMap((event) => {
    const named = troop[event];
    return !named ? [] : typeof named === 'string' ? [named] : named.filter((n) => n !== null);
  });
  return [...new Set(names.flatMap((name) => EFFECTS[name].map((take) => take.sound)))];
}
/** Stable selection in [0, 1) for a key, the same after seeks and in replays. */
function fraction(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  // FNV leaves similar short keys close in the high bits; mix them (MurmurHash3's finalizer).
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}
/** One take of an effect, with its pitch picked in the effect's range. */
export function effectCue(effect: string, key: string, at: number): SampleCue | undefined {
  const takes = EFFECTS[effect];
  if (!takes?.length) return undefined;
  const take = takes[Math.floor(fraction(key) * takes.length)];
  return {
    key,
    sample: troopSample(take.sound),
    at: at + take.delay,
    volume: take.volume,
    pitch: take.minPitch + (take.maxPitch - take.minPitch) * fraction(`${key}:pitch`),
  };
}
export const troopCue = (
  battle: Battle,
  u: Pick<Unit, 'id' | 'kind' | 'level'>,
  event: TroopSoundEvent,
  key: string,
  at: number,
) => {
  const effect = troopSoundEffect(u.kind, unitLevel(battle, u), event);
  return effect ? effectCue(effect, key, at) : undefined;
};

/**
 * Attacks and destroyed buildings are not kept in the battle state; the scene records them as
 * their combat events arrive (live or replayed) and this log turns them into cues until they
 * have played out. A seek or a new battle starts the log afresh.
 */
export class BattleSoundLog {
  private battle: Battle | null = null;
  private last = 0;
  private events: SampleCue[] = [];
  /**
   * When each unit was first seen, for deploys: a deployed troop carries no time of its own.
   * Units already on the field when the log starts or after a seek count as seen silently.
   */
  private seen = new Map<number, number>();
  private sync(battle: Battle) {
    const jumped = battle.elapsed < this.last || battle.elapsed - this.last > SEEK_GAP;
    if (battle !== this.battle || jumped) {
      this.events.length = 0;
      this.seen.clear();
      for (const u of battle.units) this.seen.set(u.id, -Infinity);
    }
    this.battle = battle;
    this.last = battle.elapsed;
  }
  /** When a unit arrived: its own spawn time, or the first frame that showed it. */
  arrived(battle: Battle, u: Unit) {
    if (u.spawnedAt !== undefined) return u.spawnedAt;
    let at = this.seen.get(u.id);
    if (at === undefined) this.seen.set(u.id, (at = battle.elapsed));
    return at;
  }
  /** A troop's attack, at the moment its hit or projectile was reported. */
  attack(battle: Battle, u: Unit) {
    this.sync(battle);
    const cue = troopCue(
      battle,
      u,
      'attack',
      `troop:${u.id}:attack:${battle.elapsed}`,
      battle.elapsed,
    );
    if (cue) this.events.push(cue);
  }
  /** A destroyed building, at its tile. */
  destroyed(battle: Battle, x: number, y: number) {
    this.sync(battle);
    const cue = effectCue(DESTROYED_EFFECT, `destroyed:${x}:${y}`, battle.elapsed);
    if (cue) this.events.push(cue);
  }
  cues(battle: Battle | null): SampleCue[] {
    if (!battle) {
      this.events.length = 0;
      this.seen.clear();
      this.battle = null;
      return [];
    }
    this.sync(battle);
    // Drop what has played out; the list stays short however long the battle runs.
    if (this.events.length && !cueAudible(this.events[0].at, battle.elapsed))
      this.events = this.events.filter((cue) => cueAudible(cue.at, battle.elapsed));
    return this.events;
  }
}

/** Deploys and deaths, read from the units themselves, plus the logged attacks and ruins. */
export function troopSoundCues(battle: Battle | null, log: BattleSoundLog): SampleCue[] {
  const logged = log.cues(battle);
  if (!battle) return logged;
  const cues: SampleCue[] = [];
  const elapsed = battle.elapsed;
  for (const u of battle.units) {
    // Units another unit, spell or ability summons arrive without a deploy call.
    const arrived = u.summoned ? -Infinity : log.arrived(battle, u);
    if (cueAudible(arrived, elapsed)) {
      const cue = troopCue(battle, u, 'deploy', `troop:${u.id}:deploy`, arrived);
      if (cue) cues.push(cue);
    }
    if (u.defeatedAt !== undefined && cueAudible(u.defeatedAt, elapsed)) {
      const cue = troopCue(battle, u, 'die', `troop:${u.id}:die`, u.defeatedAt);
      if (cue) cues.push(cue);
    }
  }
  for (const cue of logged) cues.push(cue);
  return cues;
}

/**
 * Fetches a troop kind's sounds the first time a battle needs them (about 30 KB a troop), so
 * neither boot nor a battle without that troop downloads them.
 */
export class TroopSoundLoader {
  private requested = new Set<string>();
  private kinds = new Set<string>();
  constructor(private register: (name: string, data: ArrayBuffer) => void) {}
  /** Starts loading what these kinds and the destroyed-building effect need. */
  need(kinds: Iterable<string>) {
    for (const kind of kinds) {
      if (this.kinds.has(kind)) continue;
      this.kinds.add(kind);
      for (const path of troopSoundFiles(kind)) this.fetch(path);
    }
    for (const take of EFFECTS[DESTROYED_EFFECT]) this.fetch(take.sound);
  }
  private fetch(path: string) {
    if (this.requested.has(path) || typeof fetch === 'undefined') return;
    this.requested.add(path);
    const sound = TROOP_SOUNDS[path as keyof typeof TROOP_SOUNDS];
    void fetch('/' + sound.path)
      .then((response) => {
        if (!response.ok) throw Error(`${sound.path}: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(
        (data) => this.register(troopSample(path), data),
        // A failed download is asked for again the next time a battle needs it.
        () => {
          this.requested.delete(path);
          for (const kind of this.kinds)
            if (troopSoundFiles(kind).includes(path)) this.kinds.delete(kind);
        },
      );
  }
}
