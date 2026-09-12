export interface SampleCue {
  key: string;
  sample: string;
  at: number;
  volume: number;
  pitch: number;
}

/** Short native samples synchronized to the simulation clock, including replay seeks. */
export class SampleAudio {
  private encoded = new Map<string, ArrayBuffer>();
  private buffers = new Map<string, AudioBuffer>();
  private decoding = new Set<string>();
  private active = new Map<string, { source: AudioBufferSourceNode; gain: GainNode }>();
  private ended = new Set<string>();
  private last?: { elapsed: number; wall: number; speed: number };
  constructor(private context: () => AudioContext | null) {}
  register(name: string, data: ArrayBuffer) {
    this.encoded.set(name, data);
    this.decode();
  }
  decode() {
    const ctx = this.context();
    if (!ctx) return;
    for (const [name, data] of this.encoded)
      if (!this.decoding.has(name)) {
        this.decoding.add(name);
        void ctx
          .decodeAudioData(data.slice(0))
          .then((buffer) => this.buffers.set(name, buffer))
          .catch(() => {});
      }
  }
  stop() {
    for (const { source, gain } of this.active.values()) {
      source.stop();
      source.disconnect();
      gain.disconnect();
    }
    this.active.clear();
    this.ended.clear();
    this.last = undefined;
  }
  sync(cues: SampleCue[], elapsed: number, speed: number, playing: boolean) {
    const ctx = this.context();
    if (!ctx || ctx.state !== 'running' || !playing) {
      this.stop();
      return;
    }
    this.decode();
    if (
      this.last &&
      Math.abs(elapsed - this.last.elapsed - (ctx.currentTime - this.last.wall) * this.last.speed) >
        0.15
    )
      this.stop();
    this.last = { elapsed, wall: ctx.currentTime, speed };
    const wanted = new Set<string>();
    for (const cue of cues) {
      const buffer = this.buffers.get(cue.sample),
        age = (elapsed - cue.at) * cue.pitch;
      if (!buffer || age < 0 || age >= buffer.duration) continue;
      wanted.add(cue.key);
      // Audio can finish between fixed simulation ticks. Do not replay its final tail.
      if (this.ended.has(cue.key)) continue;
      let node = this.active.get(cue.key);
      if (!node) {
        const source = ctx.createBufferSource(),
          gain = ctx.createGain();
        source.buffer = buffer;
        source.connect(gain);
        gain.connect(ctx.destination);
        gain.gain.value = cue.volume * 0.12;
        source.playbackRate.value = cue.pitch * speed;
        node = { source, gain };
        this.active.set(cue.key, node);
        source.onended = () => {
          if (this.active.get(cue.key)?.source === source) {
            this.active.delete(cue.key);
            this.ended.add(cue.key);
          }
          source.disconnect();
          gain.disconnect();
        };
        source.start(0, age);
      } else node.source.playbackRate.value = cue.pitch * speed;
    }
    for (const [key, node] of this.active)
      if (!wanted.has(key)) {
        node.source.stop();
        node.source.disconnect();
        node.gain.disconnect();
        this.active.delete(key);
      }
    for (const key of this.ended) if (!wanted.has(key)) this.ended.delete(key);
  }
}
