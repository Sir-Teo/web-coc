import { SampleAudio } from './sample-audio';
import { MusicPlayer, type MusicScene } from './music';
import { audioVolume, setAudioGain } from './audio-volume';
import villageSounds from '../../reference/village-sounds/sounds.json' with { type: 'json' };
export type Tone = 'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory';
/** The client's village feedback effects (logic/effects.csv), by its own names. */
export type VillageEffect = keyof typeof villageSounds.effects | 'Button Click';
const villageSample = (path: string) => `village-${path.split('/').pop()}`;
/** Additional already-packaged native OGG cues loaded alongside village-native sounds. */
export const EXTRA_NATIVE_SOUNDS = {
  'native-destroy': 'assets/audio/archer-tower-native/building_destroyed_01.ogg',
  'native-hit': 'assets/audio/archer-tower-native/generic_hit_01.ogg',
  'native-deploy': 'assets/audio/troops-native/barb_deploy_11.ogg',
  'native-at-pick': 'assets/audio/archer-tower-native/archer_tower_pick_01.ogg',
  'native-at-place': 'assets/audio/archer-tower-native/archer_tower_place_02.ogg',
  'native-drill-pick': 'assets/audio/dark-drill-native/dark_drill_pickup_02.ogg',
  'native-drill-place': 'assets/audio/dark-drill-native/dark_drill_place_07.ogg',
  'native-inferno-pick': 'assets/audio/inferno-native/darktower_pickup_01.ogg',
  'native-inferno-place': 'assets/audio/inferno-native/darktower_place_01.ogg',
  'native-bow-place': 'assets/audio/troops-native/bow_place.ogg',
  'native-invalid': 'assets/audio/inferno-native/darktower_noammo_02.ogg',
  'native-mode-toggle': 'assets/audio/inferno-native/darktower_reload_01.ogg',
  'native-star-chime': 'assets/audio/inferno-dragon-native/infdragon_lvl_up_03.ogg',
  'native-spell-revive': 'assets/audio/troops-native/Spell_Revive_Activate.ogg',
} as const;
export type ExtraNativeSound = keyof typeof EXTRA_NATIVE_SOUNDS;

/** Maps building pickup/place actions to native already-packaged OGG keys + material pitch. */
export function buildingAudioCue(
  kind: string,
  action: 'pickup' | 'place',
): { key: string; volume: number; pitch: number } {
  if (action === 'pickup') {
    if (kind === 'archertower') return { key: 'native-at-pick', volume: 0.58, pitch: 1 };
    if (kind === 'darkdrill') return { key: 'native-drill-pick', volume: 0.58, pitch: 1 };
    if (kind === 'inferno') return { key: 'native-inferno-pick', volume: 0.58, pitch: 1 };
    const heavy =
      kind === 'townhall' ||
      kind === 'cannon' ||
      kind === 'mortar' ||
      kind === 'bombtower' ||
      kind === 'eagle' ||
      kind === 'monolith' ||
      kind === 'scattershot';
    const arcane =
      kind === 'spellfactory' ||
      kind === 'darkspellfactory' ||
      kind === 'laboratory' ||
      kind === 'wizardtower' ||
      kind === 'tesla';
    const pitch = heavy ? 0.86 : arcane ? 1.14 : kind === 'wall' ? 0.96 : 1.03;
    return { key: villageSample('sfx/wall_pickup_01.ogg'), volume: 0.52, pitch };
  }
  if (kind === 'archertower') return { key: 'native-at-place', volume: 0.62, pitch: 1 };
  if (kind === 'darkdrill') return { key: 'native-drill-place', volume: 0.62, pitch: 1 };
  if (kind === 'inferno') return { key: 'native-inferno-place', volume: 0.62, pitch: 1 };
  if (kind === 'xbow' || kind === 'scattershot' || kind === 'monolith')
    return { key: 'native-bow-place', volume: 0.62, pitch: 1 };
  const pitch = kind === 'wall' ? 0.92 : kind === 'townhall' ? 0.72 : 0.8;
  return { key: villageSample('sfx/building_construct_07.ogg'), volume: 0.68, pitch };
}

/** Generated tones that the client's own sounds replace once decoded. */
const TONE_EFFECT: Partial<Record<Tone, VillageEffect>> = {
  click: 'Button Click',
  build: 'Start Building',
  collect: 'Collect Gold',
  victory: 'TH Upgrade Jingle',
};
const TONE_EXTRA_NATIVE: Partial<Record<Tone, { key: ExtraNativeSound; volume: number; spread: number }>> = {
  destroy: { key: 'native-destroy', volume: 0.64, spread: 0.08 },
  hit: { key: 'native-hit', volume: 0.42, spread: 0.12 },
  deploy: { key: 'native-deploy', volume: 0.5, spread: 0.06 },
};
export class AudioManager {
  context: AudioContext | null = null;
  /**
   * Native samples only see the context while effects are audible: with sound off or at zero, the first gesture
   * neither decodes the ~115 samples nor plays them. Decoding starts when sound is enabled.
   */
  samples = new SampleAudio(
    () => (this.effectsAudible ? this.context : null),
    (ctx) => this.effectsOutput(ctx),
  );
  private soundOn = true;
  /** Set by the first user gesture; a context is only created after one. */
  private unlocked = false;
  private resuming: Promise<void> | null = null;
  private musicOn = false;
  private tones = new Map<OscillatorNode, GainNode>();
  private effectsLevel = 1;
  private effectsGain: GainNode | null = null;
  /** The original client's Home and battle music; plays only while music is on. */
  readonly tracks = new MusicPlayer(() => (this.musicAudible ? this.context : null));
  private lastPlay: Partial<Record<string, number>> = {};
  /** The village sounds load once, after the first gesture with sound on (about 200 KB). */
  private villageLoad?: Promise<void>;
  constructor() {
    if (typeof document !== 'undefined')
      document.addEventListener('visibilitychange', () => this.updateContext());
  }
  get enabled() {
    return this.soundOn;
  }
  set enabled(on: boolean) {
    if (this.soundOn === on) return;
    this.soundOn = on;
    if (!on) {
      this.samples.stopAll();
      this.stopTones();
    }
    this.updateContext();
  }
  get effectsVolume() {
    return this.effectsLevel;
  }
  set effectsVolume(value: number) {
    this.effectsLevel = audioVolume(value, 1);
    if (this.effectsGain) setAudioGain(this.effectsGain, this.effectsLevel, this.context);
    if (!this.effectsLevel) {
      this.samples.stopAll();
      this.stopTones();
    }
    this.updateContext();
    if (this.unlocked) this.loadVillageSounds();
  }
  get musicVolume() {
    return this.tracks.volume;
  }
  set musicVolume(value: number) {
    const wasAudible = this.musicAudible;
    this.tracks.setVolume(value);
    if (wasAudible === this.musicAudible) return;
    this.updateContext();
    this.tracks.setEnabled(this.musicAudible);
  }
  private effectsOutput(ctx: AudioContext) {
    if (!this.effectsGain) {
      this.effectsGain = ctx.createGain();
      this.effectsGain.gain.value = this.effectsLevel;
      this.effectsGain.connect(ctx.destination);
    }
    return this.effectsGain;
  }
  /** True while anything may be heard: sound effects or music, on a visible page. */
  private get audible() {
    return (
      (this.effectsAudible || this.musicAudible) && !(typeof document !== 'undefined' && document.hidden)
    );
  }
  private get musicAudible(): boolean {
    return this.musicOn && this.tracks.volume > 0;
  }
  private get effectsAudible() {
    return this.soundOn && this.effectsLevel > 0;
  }
  /** Creates the context lazily and suspends it while nothing can be heard. */
  private updateContext() {
    if (!this.unlocked) return;
    if (this.audible) {
      const ctx = (this.context ??= new AudioContext());
      // Safari can leave a foreground page interrupted after a call or tab switch.
      if ((ctx.state === 'suspended' || ctx.state === 'interrupted') && !this.resuming) {
        const attempt: Promise<void> = ctx
          .resume()
          // The device may still own the audio hardware; another gesture can retry.
          .catch(() => {})
          .finally(() => {
            if (this.resuming === attempt) this.resuming = null;
            if (!this.audible) this.suspendContext();
          });
        this.resuming = attempt;
      }
      this.samples.decode();
    } else {
      this.stopTones();
      this.suspendContext();
    }
  }
  private suspendContext() {
    // A foreground return must not wait for a resume the suspension superseded.
    this.resuming = null;
    const ctx = this.context;
    if (ctx && (ctx.state === 'running' || ctx.state === 'interrupted'))
      void ctx.suspend().catch(() => {});
  }
  unlock() {
    this.unlocked = true;
    this.updateContext();
    this.loadVillageSounds();
  }
  private loadVillageSounds() {
    if (this.villageLoad || !this.effectsAudible || typeof fetch === 'undefined') return;
    const villageEntries = Object.entries(villageSounds.sounds).map(
      ([path, sound]) => [villageSample(path), sound.path] as const,
    );
    const extraEntries = Object.entries(EXTRA_NATIVE_SOUNDS).map(
      ([key, path]) => [key, path] as const,
    );
    this.villageLoad = Promise.all(
      [...villageEntries, ...extraEntries].map(async ([key, path]) => {
        try {
          const response = await fetch('/' + path);
          if (!response.ok) throw Error(`${path}: ${response.status}`);
          this.samples.register(key, await response.arrayBuffer());
        } catch (err) {
          // Core village sounds must retry if offline; optional native combat cues degrade gracefully.
          if (key.startsWith('village-')) throw err;
        }
      }),
    ).then(
      () => undefined,
      // Generated tones stand in; the next gesture tries again.
      () => void (this.villageLoad = undefined),
    );
  }
  /** Plays a client village sound; false when it is not decoded yet. */
  private playEffect(effect: VillageEffect) {
    if (effect === 'Button Click')
      return this.samples.shot(villageSample(villageSounds.click), 0.6);
    const row = villageSounds.effects[effect];
    const pitch = row.minPitch + Math.random() * (row.maxPitch - row.minPitch);
    return this.samples.shot(villageSample(row.sound), row.volume, pitch);
  }
  /**
   * A client village effect: collecting a resource, a building or upgrade finishing, an upgrade
   * starting. `tone` is the generated stand-in until the sound is decoded, and the haptic cue.
   */
  effect(effect: VillageEffect, tone: Tone) {
    this.feedback(tone);
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    if (this.throttled(effect, 50)) return;
    this.unlock();
    if (!this.playEffect(effect)) this.tone(tone);
  }
  private throttled(key: string, ms: number) {
    const now = performance.now();
    if (now - (this.lastPlay[key] ?? 0) < ms) return true;
    this.lastPlay[key] = now;
    return false;
  }
  /** Called for every cue, sound on or off (vibration follows the same moments). */
  feedback: (kind: Tone) => void = () => {};
  play(kind: Tone) {
    this.feedback(kind);
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    // Battles can emit dozens of blips per second; throttle per kind
    // so overlapping volleys don't thrash the mixer.
    const throttleMs =
      kind === 'hit' ? 70 : kind === 'destroy' ? 150 : kind === 'victory' ? 500 : 50;
    if (this.throttled(kind, throttleMs)) return;
    this.unlock();
    const extra = TONE_EXTRA_NATIVE[kind];
    if (extra) {
      const pitch = 1 + (Math.random() * 2 - 1) * extra.spread;
      if (this.samples.shot(extra.key, extra.volume, pitch)) return;
    }
    const effect = TONE_EFFECT[kind];
    if (effect && this.playEffect(effect)) return;
    this.tone(kind);
  }
  /** Native per-building pickup or placement foley with graceful click/build fallback. */
  playBuilding(kind: string, action: 'pickup' | 'place') {
    this.feedback(action === 'place' ? 'build' : 'click');
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    if (this.throttled(`bldg-${action}`, 45)) return;
    this.unlock();
    const cue = buildingAudioCue(kind, action);
    if (this.samples.shot(cue.key, cue.volume, cue.pitch)) return;
    if (action === 'place') this.playEffect('Start Building') || this.tone('build');
    else this.playEffect('Button Click') || this.tone('click');
  }
  /** Distinct Clash UI card-selection pitch per battle tray category. */
  playCardSelect(category: 'troop' | 'spell' | 'hero') {
    this.feedback('click');
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    if (this.throttled('card-select', 35)) return;
    this.unlock();
    const pitch = category === 'spell' ? 1.24 : category === 'hero' ? 0.82 : 1.02;
    if (this.samples.shot(villageSample(villageSounds.click), 0.56, pitch)) return;
    this.tone('click');
  }
  /** Mid-battle ascending Clash star celebration fanfare (1, 2, or 3 stars). */
  playStar(stars: number) {
    const clamped = Math.max(1, Math.min(3, Math.floor(stars)));
    this.feedback('victory');
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    if (this.throttled(`star-${clamped}`, 220)) return;
    this.unlock();
    this.duckMusic(clamped === 3 ? 0.3 : 0.42, clamped === 3 ? 1100 : 750, 600);
    // Subtle native celebratory bell accent layered beneath the ascending star triad.
    this.samples.shot(
      villageSample('sfx/building_finished_01.ogg'),
      clamped === 3 ? 0.42 : 0.28,
      clamped === 1 ? 0.96 : clamped === 2 ? 1.06 : 1.18,
    );
    if (clamped === 3) this.samples.shot('native-star-chime', 0.34, 1.04);
    const ctx = this.context;
    if (!ctx || !this.audible || ctx.state !== 'running') return;
    const notes =
      clamped === 1
        ? [523.25, 783.99]
        : clamped === 2
          ? [523.25, 659.25, 783.99]
          : [523.25, 659.25, 783.99, 1046.5];
    const base = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = base + i * 0.075;
      const dur = clamped === 3 && i === notes.length - 1 ? 0.48 : 0.24;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.055, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(gain);
      gain.connect(this.effectsOutput(ctx));
      this.tones.set(osc, gain);
      osc.start(start);
      osc.stop(start + dur + 0.01);
      osc.onended = () => {
        if (!this.tones.delete(osc)) return;
        osc.disconnect();
        gain.disconnect();
      };
    });
  }
  /** Mechanical defense mode toggle / rotation click backed by a packaged native OGG. */
  playModeToggle() {
    this.feedback('click');
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    this.unlock();
    if (this.samples.shot('native-mode-toggle', 0.56, 1.04)) return;
    if (this.samples.shot(villageSample(villageSounds.click), 0.56, 1.12)) return;
    this.tone('click');
  }
  /** Muted low thud when tapping an invalid / no-deploy tile (native OGG with synth fallback). */
  playInvalid() {
    this.feedback('hit');
    if (!this.effectsAudible) {
      if (this.musicAudible) this.unlock();
      return;
    }
    if (this.throttled('invalid-drop', 180)) return;
    this.unlock();
    if (this.samples.shot('native-invalid', 0.52, 0.92)) return;
    const ctx = this.context;
    if (!ctx || !this.audible || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    for (const [offset, freq] of [
      [0, 175],
      [0.07, 130],
    ] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + offset);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.62, now + offset + 0.07);
      gain.gain.setValueAtTime(0.04, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.075);
      osc.connect(gain);
      gain.connect(this.effectsOutput(ctx));
      this.tones.set(osc, gain);
      osc.start(now + offset);
      osc.stop(now + offset + 0.08);
      osc.onended = () => {
        if (!this.tones.delete(osc)) return;
        osc.disconnect();
        gain.disconnect();
      };
    }
  }
  /** Briefly ducks background music during high-impact stings and fanfare. */
  duckMusic(factor = 0.36, holdMs = 800, releaseMs = 550) {
    if (!this.musicAudible) return;
    this.tracks.duck(factor, holdMs, releaseMs);
  }
  /** Subtle airy sweep paired with CloudTransition across village/battle switches. */
  playCloudSweep() {
    if (!this.effectsAudible) return;
    if (this.throttled('cloud-sweep', 350)) return;
    this.unlock();
    const ctx = this.context;
    if (!ctx || !this.audible || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(540, now + 0.24);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.024, now + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain);
    gain.connect(this.effectsOutput(ctx));
    this.tones.set(osc, gain);
    osc.start(now);
    osc.stop(now + 0.27);
    osc.onended = () => {
      if (!this.tones.delete(osc)) return;
      osc.disconnect();
      gain.disconnect();
    };
  }
  /** Crisp low-volume countdown tick during the final 10s of timed scouting or battle. */
  playCountdownTick(finalFive = false) {
    if (!this.effectsAudible) return;
    if (this.throttled('countdown-tick', 750)) return;
    this.unlock();
    this.samples.shot(
      villageSample(villageSounds.click),
      finalFive ? 0.34 : 0.22,
      finalFive ? 1.52 : 1.32,
    );
  }
  /** The generated stand-in for a cue. */
  private tone(kind: Tone) {
    const ctx = this.context;
    if (!ctx || !this.audible || ctx.state !== 'running') return;
    const settings = {
      click: [600, 0.04, 'sine'],
      collect: [1100, 0.18, 'sine'],
      build: [360, 0.15, 'triangle'],
      hit: [120, 0.06, 'triangle'],
      destroy: [65, 0.3, 'sawtooth'],
      deploy: [420, 0.12, 'triangle'],
      victory: [660, 0.5, 'sine'],
    }[kind] as [number, number, OscillatorType];
    const [freq, duration, type] = settings;
    const osc = ctx.createOscillator(),
      gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      kind === 'collect' ? 1800 : Math.max(30, freq * 0.5),
      ctx.currentTime + duration,
    );
    gain.gain.setValueAtTime(kind === 'destroy' ? 0.045 : 0.025, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(this.effectsOutput(ctx));
    this.tones.set(osc, gain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      if (!this.tones.delete(osc)) return;
      osc.disconnect();
      gain.disconnect();
    };
  }
  private stopTones() {
    for (const [osc, gain] of this.tones) {
      osc.onended = null;
      try {
        osc.stop();
      } catch {
        // An already-ended oscillator still needs its connections released.
      }
      osc.disconnect();
      gain.disconnect();
    }
    this.tones.clear();
  }
  music(on: boolean) {
    this.musicOn = on;
    if (on) this.unlock();
    else this.updateContext();
    this.tracks.setEnabled(this.musicAudible);
  }
  /** Follow the screen: Home, battle planning, combat, or the result's sting. */
  musicScene(scene: MusicScene) {
    this.tracks.setScene(scene);
  }
}
