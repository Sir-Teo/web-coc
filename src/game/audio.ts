export class AudioManager {
  context: AudioContext | null = null;
  enabled = true;
  private ambient: OscillatorNode[] = [];
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  play(kind: 'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory') {
    if (!this.enabled) return;
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
  }
  music(on: boolean) {
    for (const o of this.ambient) o.stop();
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
      this.ambient.push(o);
    }
  }
}
