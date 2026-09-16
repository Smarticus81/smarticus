/**
 * Microphone capture for the fallback voice tier.
 *
 * Gemini Live takes 16kHz mono PCM16. The AudioContext is created at that rate
 * so the browser's own resampler does the conversion and this worklet only has
 * to batch frames and narrow them to Int16.
 *
 * Served as a static file rather than a blob URL because AudioWorklet module
 * loading is governed by the page's script-src, which allows 'self' only.
 */

/** ~60ms at 16kHz: small enough to keep latency down, large enough to batch. */
const FRAME_SIZE = 1024;

class PcmRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(FRAME_SIZE);
    this.offset = 0;
    this.enabled = true;
    this.port.onmessage = (event) => {
      if (event.data && typeof event.data.enabled === "boolean") {
        this.enabled = event.data.enabled;
        // Drop whatever was mid-frame so unmuting cannot replay stale audio.
        if (!this.enabled) this.offset = 0;
      }
    };
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || !this.enabled) return true;

    for (let i = 0; i < channel.length; i += 1) {
      this.buffer[this.offset] = channel[i];
      this.offset += 1;
      if (this.offset < FRAME_SIZE) continue;

      const pcm = new Int16Array(FRAME_SIZE);
      for (let j = 0; j < FRAME_SIZE; j += 1) {
        const sample = Math.max(-1, Math.min(1, this.buffer[j]));
        // Asymmetric on purpose: -1 maps to -32768, +1 to 32767.
        pcm[j] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
      this.offset = 0;
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
