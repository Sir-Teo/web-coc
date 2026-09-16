import { SampleAudio } from './sample-audio';
export class AudioManager {
  context: AudioContext | null = null;
  enabled = true;
  samples = new SampleAudio(() => this.context);
  private ambient: { osc: OscillatorNode; gain: GainNode }[] = [];
  private lastPlay: Partial<Record<'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory', number>> = {};
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
    this.samples.decode();
  }
  play(kind: 'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory') {
    if (!this.enabled) return;
    // Battles can emit dozens of blips per second; throttle per kind
    // so overlapping volleys don't thrash the mixer.
    const throttleMs =
      kind === 'hit' ? 70 : kind === 'destroy' ? 150 : kind === 'victory' ? 500 : 50;
    const now = performance.now();
    if (now - (this.lastPlay[kind] ?? 0) < throttleMs) return;
    this.lastPlay[kind] = now;
    this.unlock();
    const ctx = this.context!;
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
    if (!on) return;
    this.unlock();
    const ctx = this.context!;
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
