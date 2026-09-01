import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } from "@openai/agents/realtime";
import { api } from "../lib/api";
import { createTutorTools } from "./tools";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface TranscriptLine {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
}

interface VoiceTutorProps {
  lessonId: string;
  lessonTitle: string;
  embedded?: boolean;
  onConnectionChange?: (active: boolean) => void;
}

const MICROPHONE_TIMEOUT_MS = 20_000;
const WAKE_WORD = "virgil";
const WAKE_WORD_CONFIDENCE_THRESHOLD = 0.4;
const GOODBYE_PATTERN =
  /\b(?:good\s*bye|bye(?:-bye)?|see you(?: later)?|talk to you later|that(?:'s| is) all)\b/i;

interface TranscriptionLogprob {
  token: string;
  logprob: number;
}

function wakeWordConfidence(logprobs: TranscriptionLogprob[] | undefined): number | null {
  if (!logprobs?.length) return null;

  const tokenRanges: Array<TranscriptionLogprob & { start: number; end: number }> = [];
  let text = "";
  for (const entry of logprobs) {
    const start = text.length;
    text += entry.token;
    tokenRanges.push({ ...entry, start, end: text.length });
  }

  const normalized = text.toLocaleLowerCase();
  const wakeStart = normalized.indexOf(WAKE_WORD);
  if (wakeStart < 0) return null;
  const wakeEnd = wakeStart + WAKE_WORD.length;
  const wakeTokens = tokenRanges.filter(
    (entry) => entry.end > wakeStart && entry.start < wakeEnd,
  );
  if (!wakeTokens.length) return null;

  const meanLogprob =
    wakeTokens.reduce((total, entry) => total + entry.logprob, 0) /
    wakeTokens.length;
  return Math.min(1, Math.max(0, Math.exp(meanLogprob)));
}

function hasConfidentWakeWord(
  transcript: string,
  logprobs: TranscriptionLogprob[] | undefined,
) {
  if (!new RegExp(`\\b${WAKE_WORD}\\b`, "i").test(transcript)) return false;
  const confidence = wakeWordConfidence(logprobs);
  return confidence === null || confidence >= WAKE_WORD_CONFIDENCE_THRESHOLD;
}

async function requestMicrophone(): Promise<MediaStream> {
  if (!window.isSecureContext) {
    throw new Error("Microphone access requires HTTPS or localhost.");
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser does not support microphone access.");
  }

  let timedOut = false;
  const request = navigator.mediaDevices
    .getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
    .then((stream) => {
      if (timedOut) {
        stream.getTracks().forEach((track) => track.stop());
        throw new Error("Microphone permission timed out. Allow microphone access, then try again.");
      }
      return stream;
    });

  let timeoutId = 0;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = window.setTimeout(() => {
      timedOut = true;
      reject(
        new Error(
          "Microphone permission timed out. Allow microphone access in the browser, then try again.",
        ),
      );
    }, MICROPHONE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request, timeout]);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function voiceStartupError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access was denied. Allow microphone access in the browser, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No microphone was found. Connect a microphone, then try again.";
    }
    if (error.name === "NotReadableError" || error.name === "TrackStartError") {
      return "The microphone is being used by another app. Close that app, then try again.";
    }
  }
  return error instanceof Error ? error.message : "Unable to begin the lesson.";
}

export function VoiceTutor({
  lessonId,
  lessonTitle,
  embedded = false,
  onConnectionChange,
}: VoiceTutorProps) {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const tutorSessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const outputProbeRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const isAwakeRef = useRef(false);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    onConnectionChange?.(
      connection === "connecting" || connection === "connected",
    );
  }, [connection, onConnectionChange]);

  const setWakeState = useCallback((awake: boolean) => {
    isAwakeRef.current = awake;
    setIsAwake(awake);
  }, []);

  const appendTranscript = useCallback((role: TranscriptLine["role"], text: string) => {
    if (!text.trim()) return;
    setTranscript((previous) => [
      ...previous,
      { role, text: text.trim(), timestamp: new Date().toISOString() },
    ]);
  }, []);

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(bounds.width));
    const height = Math.max(1, Math.floor(bounds.height));
    if (canvas.width !== width * ratio || canvas.height !== height * ratio) {
      canvas.width = width * ratio;
      canvas.height = height * ratio;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    context.clearRect(0, 0, width, height);
    const analyser = isSpeakingRef.current
      ? outputAnalyserRef.current ?? inputAnalyserRef.current
      : inputAnalyserRef.current;
    const points = analyser?.fftSize ?? 1024;
    const samples = new Uint8Array(points);

    if (analyser) {
      analyser.getByteTimeDomainData(samples);
    } else {
      samples.fill(128);
    }

    const gradient = context.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, "rgba(117, 246, 217, 0.12)");
    gradient.addColorStop(0.22, "rgba(117, 246, 217, 0.92)");
    gradient.addColorStop(0.5, "rgba(240, 255, 250, 1)");
    gradient.addColorStop(0.78, "rgba(117, 246, 217, 0.92)");
    gradient.addColorStop(1, "rgba(117, 246, 217, 0.12)");

    context.beginPath();
    context.lineWidth = width < 600 ? 2 : 2.5;
    context.strokeStyle = gradient;
    context.shadowColor = isSpeakingRef.current
      ? "rgba(139, 125, 255, 0.85)"
      : "rgba(79, 238, 202, 0.75)";
    context.shadowBlur = isSpeakingRef.current ? 24 : 16;

    const center = height / 2;
    const amplitude = Math.min(height * 0.4, 170);
    for (let index = 0; index < samples.length; index += 1) {
      const x = (index / (samples.length - 1)) * width;
      const normalized = (samples[index] - 128) / 128;
      const edgeEnvelope = Math.sin(Math.PI * (index / (samples.length - 1)));
      const y = center + normalized * amplitude * edgeEnvelope;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
    context.shadowBlur = 0;
    animationRef.current = requestAnimationFrame(drawWaveform);
  }, []);

  const startVisualizer = useCallback(
    (inputStream: MediaStream, audioElement: HTMLAudioElement) => {
      const AudioContextClass = window.AudioContext;
      const audioContext = new AudioContextClass({ latencyHint: "interactive" });
      audioContextRef.current = audioContext;

      const inputAnalyser = audioContext.createAnalyser();
      inputAnalyser.fftSize = 2048;
      inputAnalyser.smoothingTimeConstant = 0.72;
      audioContext.createMediaStreamSource(inputStream).connect(inputAnalyser);
      inputAnalyserRef.current = inputAnalyser;

      outputProbeRef.current = window.setInterval(() => {
        const outputStream = audioElement.srcObject;
        if (!(outputStream instanceof MediaStream) || outputAnalyserRef.current) return;
        const outputAnalyser = audioContext.createAnalyser();
        outputAnalyser.fftSize = 2048;
        outputAnalyser.smoothingTimeConstant = 0.72;
        audioContext.createMediaStreamSource(outputStream).connect(outputAnalyser);
        outputAnalyserRef.current = outputAnalyser;
        if (outputProbeRef.current !== null) {
          window.clearInterval(outputProbeRef.current);
          outputProbeRef.current = null;
        }
      }, 100);

      if (animationRef.current === null) {
        animationRef.current = requestAnimationFrame(drawWaveform);
      }
    },
    [drawWaveform],
  );

  const cleanup = useCallback(async () => {
    if (sessionRef.current) {
      try {
        await sessionRef.current.close();
      } catch {
        // The transport may already be closed.
      }
      sessionRef.current = null;
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    if (outputProbeRef.current !== null) window.clearInterval(outputProbeRef.current);
    outputProbeRef.current = null;
    inputAnalyserRef.current = null;
    outputAnalyserRef.current = null;
    await audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, []);

  const endSession = useCallback(async () => {
    const summary = transcript
      .slice(-8)
      .map((line) => `${line.role}: ${line.text}`)
      .join("\n");
    if (tutorSessionIdRef.current) {
      await api
        .endSession({
          session_id: tutorSessionIdRef.current,
          summary: summary || `Voice session for ${lessonTitle}`,
          transcript,
        })
        .catch(() => undefined);
      tutorSessionIdRef.current = null;
    }
    await cleanup();
    setConnection("idle");
    setIsSpeaking(false);
    setIsMuted(false);
    setWakeState(false);
  }, [cleanup, lessonTitle, setWakeState, transcript]);

  const connect = useCallback(async () => {
    if (connection === "connecting" || connection === "connected") return;
    setError(null);
    setConnection("connecting");

    try {
      const mediaStream = await requestMicrophone();
      mediaStreamRef.current = mediaStream;

      const [secret, started] = await Promise.all([
        api.clientSecret(lessonId),
        api.tool.lessonStarted(lessonId),
      ]);
      tutorSessionIdRef.current = started.sessionId;
      if (
        secret.lessonId !== lessonId ||
        !secret.instructions.includes("[SELECTED_LESSON:")
      ) {
        throw new Error("The voice session did not receive the selected lesson context.");
      }

      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.setAttribute("playsinline", "");
      audioRef.current = audioElement;
      startVisualizer(mediaStream, audioElement);

      const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement });
      const agent = new RealtimeAgent({
        name: "Atticus Tutor",
        instructions: secret.instructions,
        tools: createTutorTools(lessonId),
      });
      const session = new RealtimeSession(agent, {
        model: secret.sessionModel,
        transport,
        historyStoreAudio: false,
        config: {
          providerData: {
            include: ["item.input_audio_transcription.logprobs"],
          },
          outputModalities: ["audio"],
          audio: {
            input: {
              transcription: { model: "gpt-live-transcribe" },
              turnDetection: {
                type: "semantic_vad",
                eagerness: "auto",
                createResponse: true,
                interruptResponse: true,
              },
            },
          },
        },
      });

      session.on("transport_event", (event: {
        type?: string;
        transcript?: string;
        text?: string;
        delta?: string;
        logprobs?: TranscriptionLogprob[] | null;
      }) => {
        const type = event.type ?? "";
        if (type === "response.output_audio.delta" || type === "response.audio.delta") {
          setIsSpeaking(true);
        }
        if (
          type === "response.done" ||
          type === "response.output_audio.done" ||
          type === "response.audio.done"
        ) {
          setIsSpeaking(false);
        }
        if (type.includes("output_audio_transcript.done") && event.transcript) {
          appendTranscript("assistant", event.transcript);
        }
        if (type.includes("input_audio_transcription.completed") && event.transcript) {
          appendTranscript("user", event.transcript);
          if (isAwakeRef.current && GOODBYE_PATTERN.test(event.transcript)) {
            setWakeState(false);
          } else if (
            hasConfidentWakeWord(event.transcript, event.logprobs ?? undefined)
          ) {
            setWakeState(true);
          }
        }
      });

      sessionRef.current = session;
      await session.connect({ apiKey: secret.value });
      setConnection("connected");
    } catch (caught) {
      if (tutorSessionIdRef.current) {
        await api
          .endSession({
            session_id: tutorSessionIdRef.current,
            summary: `Voice session setup failed for ${lessonTitle}`,
          })
          .catch(() => undefined);
        tutorSessionIdRef.current = null;
      }
      await cleanup();
      setError(voiceStartupError(caught));
      setConnection("error");
    }
  }, [
    appendTranscript,
    cleanup,
    connection,
    lessonId,
    lessonTitle,
    setWakeState,
    startVisualizer,
  ]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !isMuted;
    await session.mute(next);
    setIsMuted(next);
  }, [isMuted]);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(drawWaveform);
    return () => {
      if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
      void cleanup();
    };
  }, [cleanup, drawWaveform]);

  const status =
    connection === "connecting"
      ? "Allow microphone access to continue"
      : connection === "connected"
        ? isMuted
          ? "Microphone muted"
          : isSpeaking
            ? "Atticus Tutor is speaking"
            : isAwake
              ? "Listening"
              : 'Say “Virgil” to begin'
        : error
          ? "Tap the wave to retry"
          : "Tap the wave to begin";

  return (
    <section
      className={`voice-stage ${embedded ? "voice-stage--embedded" : ""} ${isSpeaking ? "voice-stage--speaking" : ""}`}
      aria-label={`Voice tutor for ${lessonTitle}`}
    >
      <div className="voice-ambient voice-ambient--one" />
      <div className="voice-ambient voice-ambient--two" />

      <button
        className="wave-surface"
        type="button"
        onClick={() => void connect()}
        disabled={connection === "connecting" || connection === "connected"}
        aria-label={status}
      >
        <canvas ref={canvasRef} className="voice-waveform" />
        <span className={`voice-orb voice-orb--${connection}`} />
      </button>

      <section className="voice-hud" aria-live="polite">
        <span className={`voice-status-dot voice-status-dot--${connection}`} />
        <span>{status}</span>
      </section>

      {connection === "connected" && (
        <nav className="voice-controls" aria-label="Voice session controls">
          <button type="button" onClick={() => void toggleMute()}>
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <span className="voice-controls__divider" />
          <button type="button" onClick={() => void endSession()}>
            End session
          </button>
        </nav>
      )}

      {error && <p className="voice-error">{error}</p>}
    </section>
  );
}
