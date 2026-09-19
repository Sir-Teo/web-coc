import { SampleAudio } from './sample-audio';
type Tone = 'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory';
export class AudioManager {
  context: AudioContext | null = null;
  /**
   * Native samples only see the context while sound is on: with sound off, the first gesture
   * neither decodes the ~115 samples nor plays them. Decoding starts when sound is enabled.
   */
  samples = new SampleAudio(() => (this.soundOn ? this.context : null));
  private soundOn = true;
  /** Set by the first user gesture; a context is only created after one. */
  private unlocked = false;
  private musicOn = false;
  private ambient: { osc: OscillatorNode; gain: GainNode }[] = [];
  private lastPlay: Partial<Record<Tone, number>> = {};
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
    if (!on) this.samples.stop();
    this.updateContext();
  }
  /** True while anything may be heard: sound effects or music, on a visible page. */
  private get audible() {
    return (this.soundOn || this.musicOn) && !(typeof document !== 'undefined' && document.hidden);
  }
  /** Creates the context lazily and suspends it while nothing can be heard. */
  private updateContext() {
    if (!this.unlocked) return;
    if (this.audible) {
      if (!this.context) this.context = new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
      this.samples.decode();
    } else if (this.context?.state === 'running') void this.context.suspend();
  }
  unlock() {
    this.unlocked = true;
    this.updateContext();
  }
  play(kind: Tone) {
    if (!this.enabled) return;
    // Battles can emit dozens of blips per second; throttle per kind
    // so overlapping volleys don't thrash the mixer.
    const throttleMs =
      kind === 'hit' ? 70 : kind === 'destroy' ? 150 : kind === 'victory' ? 500 : 50;
    const now = performance.now();
    if (now - (this.lastPlay[kind] ?? 0) < throttleMs) return;
    this.lastPlay[kind] = now;
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
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
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  }
  music(on: boolean) {
    for (const { osc, gain } of this.ambient) {
      try {
        osc.stop();
      } catch {
        // Already stopped.
      }
      osc.disconnect();
      gain.disconnect();
    }
    this.ambient = [];
    this.musicOn = on;
    if (!on) {
      this.updateContext();
      return;
    }
    this.unlock();
    const ctx = this.context;
    if (!ctx) return;
    for (const f of [130.81, 196, 261.63]) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.value = 0.006;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
      this.ambient.push({ osc: o, gain: g });
    }
  }
}
