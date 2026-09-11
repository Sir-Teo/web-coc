type Target = {
  active: boolean;
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
  destroy(): void;
};
type Property = 'x' | 'y' | 'alpha' | 'scaleX' | 'scaleY';
export type EffectTween = Partial<Record<Property | 'scale', number>> & {
  targets: Target;
  duration: number;
  delay?: number;
  onComplete: () => void;
};

/** Linear combat feedback driven explicitly by simulation time, in seconds. */
export class EffectTimeline {
  private entries = new Set<{
    config: EffectTween;
    start: number;
    values: { key: Property; from: number; to: number }[];
  }>();

  add(config: EffectTween, now: number) {
    const values = (['x', 'y', 'alpha', 'scaleX', 'scaleY'] as const).flatMap((key) => {
      const to = config[key] ?? (key === 'scaleX' || key === 'scaleY' ? config.scale : undefined);
      return to === undefined ? [] : [{ key, from: config.targets[key], to }];
    });
    this.entries.add({ config, start: now + (config.delay ?? 0) / 1000, values });
  }

  update(now: number) {
    for (const entry of [...this.entries]) {
      const { config, start, values } = entry;
      if (!config.targets.active) {
        this.entries.delete(entry);
        continue;
      }
      if (now < start) continue;
      const progress =
        config.duration <= 0 ? 1 : Math.min(1, ((now - start) * 1000) / config.duration);
      for (const { key, from, to } of values) config.targets[key] = from + (to - from) * progress;
      if (progress === 1) {
        this.entries.delete(entry);
        config.onComplete();
      }
    }
  }

  clear() {
    for (const { config } of this.entries) if (config.targets.active) config.targets.destroy();
    this.entries.clear();
  }
}
