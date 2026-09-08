/** RMS of audible output. No timer, transcript estimate, or microphone fallback. */
export function speechEnergy(samples: Uint8Array): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
  const rms = Math.sqrt(sum / samples.length);
  return rms < 0.008 ? 0 : Math.min(1, Math.sqrt(rms) * 1.8);
}

/** Generation can finish before the WebRTC playout buffer drains. */
export function playbackState(previous: boolean, eventType: string): boolean {
  if (eventType === "output_audio_buffer.started") return true;
  if (
    ["output_audio_buffer.stopped", "output_audio_buffer.cleared"].includes(
      eventType,
    )
  )
    return false;
  return previous;
}
