export class AudioManager {
  context: AudioContext | null = null;
  enabled = true;
  private ambient: OscillatorNode[] = [];
  unlock() {
    if (!this.context) this.context = new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
  }
  play(
    kind:
      'click' | 'collect' | 'build' | 'hit' | 'destroy' | 'deploy' | 'victory' | 'gust' | 'tesla',
  ) {
    if (!this.enabled) return;
    this.unlock();
    const ctx = this.context!;
    if (kind === 'tesla') {
      const duration = 0.16,
        at = ctx.currentTime;
      const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        const t = i / ctx.sampleRate;
        data[i] = (Math.random() * 2 - 1) * (0.35 + 0.65 * Math.max(0, Math.sin(t * 480)));
      }
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(3900, at);
      filter.frequency.exponentialRampToValueAtTime(1000, at + duration);
      filter.Q.value = 1.3;
      gain.gain.setValueAtTime(0.06, at);
      gain.gain.exponentialRampToValueAtTime(0.001, at + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      noise.start(at);
      noise.stop(at + duration);
      return;
    }
    if (kind === 'gust') {
      const duration = 0.55,
        buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(),
        filter = ctx.createBiquadFilter(),
        gain = ctx.createGain();
      noise.buffer = buffer;
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1300, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + duration);
      filter.Q.value = 0.65;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.07, ctx.currentTime + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      noise.onended = () => {
        noise.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      noise.start();
      noise.stop(ctx.currentTime + duration);
      return;
    }
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
