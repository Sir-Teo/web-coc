/** Runtime controls clamp values; imported saves validate their original values separately. */
export function audioVolume(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : fallback;
}

/** Smooth live changes without scheduling zero-valued exponential ramps. */
export function setAudioGain(gain: GainNode, volume: number, context: AudioContext | null) {
  if (context?.state === 'running') {
    gain.gain.cancelScheduledValues(context.currentTime);
    gain.gain.setTargetAtTime(volume, context.currentTime, 0.01);
  } else gain.gain.value = volume;
}
