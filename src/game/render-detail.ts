/**
 * Adaptive presentation detail for big battles. The simulation never changes; only how often
 * distant troops resample their animation and how many projectile trails are drawn.
 *
 * 0: full detail. 1: reduced (distant units animate at a reduced rate, near ones at half
 * frame rate, every other shot trails). 2: minimal (every unit at the reduced rate, no trails).
 *
 * The level is the larger of a unit-count step (deterministic, so a huge army never starts a
 * battle at full detail and stutters into it) and a pressure step measured from the CPU time
 * of each frame: raised after a window of mostly slow frames, lowered only after a long calm.
 */
export class RenderDetail {
  level = 0;
  private pressure = 0;
  private frames = 0;
  private slow = 0;
  private calm = 0;
  /** Living units above which detail drops one step, then two. */
  static readonly UNIT_STEPS = [260, 440] as const;
  /** Per-frame CPU work that rules out a smooth frame rate. */
  static readonly SLOW_MS = 22;
  /** A frame interval that missed the vsync: the GPU side may be the bottleneck. */
  static readonly SLOW_FRAME_MS = 24;
  /** Per-frame CPU work with real headroom, below which pressure may ease. */
  static readonly CALM_MS = 11;
  /** Frames per pressure window, and calm frames needed before easing one step. */
  static readonly WINDOW = 60;
  static readonly CALM_FRAMES = 360;
  reset() {
    this.level = this.pressure = this.frames = this.slow = this.calm = 0;
  }
  /**
   * `busyMs`: CPU time of the previous frame (NaN when unknown, e.g. the first frame).
   * `frameMs`: interval since the previous frame; a long one with little CPU work means the GPU
   * is behind, which also counts as slow. Gaps (tab hidden) are ignored.
   */
  sample(busyMs: number, units: number, frameMs = NaN) {
    const steps = RenderDetail.UNIT_STEPS;
    const base = units > steps[1] ? 2 : units > steps[0] ? 1 : 0;
    if (Number.isFinite(busyMs) && busyMs >= 0) {
      this.frames++;
      const frameSlow = frameMs > RenderDetail.SLOW_FRAME_MS && frameMs <= 250;
      if (busyMs > RenderDetail.SLOW_MS || frameSlow) this.slow++;
      if (busyMs < RenderDetail.CALM_MS && !frameSlow) this.calm++;
      else this.calm = 0;
      if (this.frames >= RenderDetail.WINDOW) {
        if (this.slow * 2 > this.frames) {
          this.pressure = Math.min(2, this.pressure + 1);
          this.calm = 0;
        }
        this.frames = this.slow = 0;
      }
      if (this.calm >= RenderDetail.CALM_FRAMES) {
        this.pressure = Math.max(0, this.pressure - 1);
        this.calm = 0;
      }
    }
    return (this.level = Math.max(base, this.pressure));
  }
}
