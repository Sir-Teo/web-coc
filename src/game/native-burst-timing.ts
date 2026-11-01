/** The source combat clock rounds a burst gap to whole 64 ms steps. */
export const BURST_STEP = 0.064;
export const burstGap = (seconds: number) => Math.ceil(seconds / BURST_STEP - 1e-9) * BURST_STEP;
