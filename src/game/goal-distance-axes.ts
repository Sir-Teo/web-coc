interface DistanceAxes {
  readonly x: Readonly<Float64Array>;
  readonly y: Readonly<Float64Array>;
}

/** Goal geometry is unchanged when a collision grid rebuilds after a building falls. */
export class GoalDistanceAxes {
  private entries = new Map<string, DistanceAxes>();

  constructor(
    private readonly cells: number,
    private readonly subtiles: number,
    private readonly limit = 64,
  ) {}

  get(x: number, y: number, size: number): DistanceAxes {
    const key = `${x},${y},${size}`;
    const cached = this.entries.get(key);
    if (cached) {
      this.entries.delete(key);
      this.entries.set(key, cached);
      return cached;
    }
    const axes = { x: new Float64Array(this.cells), y: new Float64Array(this.cells) };
    for (let i = 0; i < this.cells; i++) {
      const center = (i + 0.5) / this.subtiles;
      const dx = Math.max(x - center, 0, center - x - size);
      const dy = Math.max(y - center, 0, center - y - size);
      // Same operation order as distance2D: add these squares before taking the square root.
      axes.x[i] = dx * dx;
      axes.y[i] = dy * dy;
    }
    this.entries.set(key, axes);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
    return axes;
  }

  clear() {
    this.entries.clear();
  }
}
