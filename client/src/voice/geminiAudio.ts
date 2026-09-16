/**
 * Browser audio for the fallback voice tier.
 *
 * The paid path hands raw audio to WebRTC and never touches samples. Gemini
 * Live speaks base64 PCM over a WebSocket instead, so capture and playback are
 * built here: PCM16 at 16kHz up to the model, PCM16 at 24kHz back down.
 */

const INPUT_SAMPLE_RATE = 16_000;
const OUTPUT_SAMPLE_RATE = 24_000;
const WORKLET_URL = "/voice/pcm-recorder.worklet.js";
/** Playback is scheduled this far ahead to absorb jitter without audible lag. */
const SCHEDULE_AHEAD_S = 0.08;

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunked: a spread over a whole buffer overflows the argument limit.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Int16Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  // The byte length is even for PCM16, but a truncated frame must not throw.
  return new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
}

/** Streams microphone audio as base64 PCM16 frames. */
export class PcmRecorder {
  private context: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(
    private readonly stream: MediaStream,
    private readonly onFrame: (base64: string) => void,
  ) {}

  async start() {
    const context = new AudioContext({ sampleRate: INPUT_SAMPLE_RATE });
    this.context = context;
    await context.resume().catch(() => undefined);
    await context.audioWorklet.addModule(WORKLET_URL);
    const node = new AudioWorkletNode(context, "pcm-recorder", {
      numberOfInputs: 1,
      numberOfOutputs: 0,
    });
    node.port.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) this.onFrame(encodeBase64(event.data));
    };
    this.source = context.createMediaStreamSource(this.stream);
    this.source.connect(node);
    this.node = node;
  }

  setEnabled(enabled: boolean) {
    this.node?.port.postMessage({ enabled });
  }

  async stop() {
    this.node?.port.close();
    this.source?.disconnect();
    this.node?.disconnect();
    this.node = null;
    this.source = null;
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => undefined);
  }
}

/**
 * Plays streamed PCM16 into a MediaStream.
 *
 * The result is exposed as a stream rather than played directly so the avatar's
 * existing energy analyser — which reads `audioElement.srcObject` — works the
 * same on either provider.
 */
export class PcmPlayer {
  private context: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private queued = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;

  async start(): Promise<MediaStream> {
    const context = new AudioContext({ sampleRate: OUTPUT_SAMPLE_RATE });
    this.context = context;
    await context.resume().catch(() => undefined);
    this.destination = context.createMediaStreamDestination();
    return this.destination.stream;
  }

  /** Queue one chunk of base64 PCM16 for gapless playback. */
  play(base64: string) {
    const context = this.context;
    const destination = this.destination;
    if (!context || !destination) return;

    const pcm = decodeBase64(base64);
    if (!pcm.length) return;
    const buffer = context.createBuffer(1, pcm.length, OUTPUT_SAMPLE_RATE);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000;

    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    const startAt = Math.max(context.currentTime + SCHEDULE_AHEAD_S, this.nextStartTime);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.queued.add(source);
    source.onended = () => this.queued.delete(source);
  }

  /**
   * Drop everything still queued.
   *
   * The model reports an interruption the moment the learner speaks over it, but
   * by then seconds of its reply may already be scheduled. Without this the
   * tutor keeps talking over him, which the voice prompt explicitly forbids.
   */
  stopAll() {
    for (const source of this.queued) {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    }
    this.queued.clear();
    this.nextStartTime = 0;
  }

  async stop() {
    this.stopAll();
    this.destination = null;
    const context = this.context;
    this.context = null;
    await context?.close().catch(() => undefined);
  }
}
