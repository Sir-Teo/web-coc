import type Phaser from 'phaser';

const installed = new WeakSet<Phaser.Core.TimeStep>();

/** Install before TimeStep.start; preserve Phaser's scheduling and delta smoothing. */
export function correctCappedClock(loop: Phaser.Core.TimeStep) {
  if (installed.has(loop)) return;
  installed.add(loop);
  let consumedCarry = 0;
  let pendingUncapped = 0;
  const setLimit = loop.setFPSLimit;
  const start = loop.start;
  const reset = loop.resetDelta;
  loop.resetDelta = function () {
    consumedCarry = pendingUncapped = 0;
    reset.call(this);
  };
  loop.setFPSLimit = function (limit) {
    if (this.hasFpsLimit && limit <= 0) pendingUncapped = Math.max(0, this.delta - consumedCarry);
    // If no uncapped callback ran, the pending time is still in the accumulator.
    if (limit > 0) pendingUncapped = 0;
    return setLimit.call(this, limit);
  };
  loop.start = function (callback) {
    start.call(this, (time, delta) => {
      const limited = this.hasFpsLimit;
      // Phaser 4.2.1 delivers the entire accumulator, then retains its remainder.
      // That remainder was already delivered. Uncapped callbacks overwrite delta,
      // but leave it behind for a subsequent switch back to capped scheduling.
      const elapsed = limited ? Math.max(0, delta - consumedCarry) : delta + pendingUncapped;
      pendingUncapped = 0;
      callback.call(this, time, elapsed);
      consumedCarry =
        limited && this.fpsLimit > 0 ? this.delta % (1000 / this.fpsLimit) : this.delta;
    });
  };
}
