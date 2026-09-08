import { useCallback, useEffect, useRef, useState } from "react";
import {
  RealtimeAgent,
  RealtimeSession,
  OpenAIRealtimeWebRTC,
} from "@openai/agents/realtime";
import { api } from "../lib/api";
import { createTutorTools } from "./tools";
import { Icon } from "../components/Icon";
import { createSessionPayload, type TranscriptLine } from "./sessionPayload";
import { VirgilAvatar } from "./VirgilAvatar";
import { playbackState } from "./speechSignal";
import { withLearningFocus } from "./learningFocus";

type ConnectionState = "idle" | "connecting" | "connected" | "error";

interface VoiceTutorProps {
  lessonId: string;
  lessonTitle: string;
  learningFocus?: string;
  onBusyChange?: (busy: boolean) => void;
}

const MICROPHONE_TIMEOUT_MS = 20_000;

const WAKE_WORD = "virgil";
const WAKE_WORD_CONFIDENCE_THRESHOLD = 0.4;
const GOODBYE_PATTERN =
  /\b(?:good\s*bye|bye(?:-bye)?|see you(?: later)?|talk to you later|that(?:'s| is) all)\b/i;

function listeningModeConfig(awake: boolean) {
  return {
    type: "semantic_vad" as const,
    eagerness: awake ? ("high" as const) : ("low" as const),
    createResponse: awake,
    interruptResponse: false,
  };
}

interface TranscriptionLogprob {
  token: string;
  logprob: number;
}

function wakeWordConfidence(
  logprobs: TranscriptionLogprob[] | undefined,
): number | null {
  if (!logprobs?.length) return null;

  const tokenRanges: Array<
    TranscriptionLogprob & { start: number; end: number }
  > = [];
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

function containsConfirmedSpeech(text: string) {
  const normalized = text.trim().toLocaleLowerCase();
  if (/\b(?:stop|wait|pause|no|virgil|actually|hold on)\b/i.test(normalized)) {
    return true;
  }
  const words = normalized.match(/[\p{L}\p{N}']+/gu) ?? [];
  return words.length >= 2 || words.some((word) => word.length >= 4);
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
        throw new Error(
          "Microphone permission timed out. Allow microphone access, then try again.",
        );
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
    if (
      error.name === "NotFoundError" ||
      error.name === "DevicesNotFoundError"
    ) {
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
  learningFocus = "",
  onBusyChange,
}: VoiceTutorProps) {
  const [connection, setConnection] = useState<ConnectionState>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isAwake, setIsAwake] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [ended, setEnded] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    onBusyChange?.(
      connection === "connecting" ||
        connection === "connected" ||
        saving ||
        saveFailed,
    );
  }, [connection, onBusyChange, saving, saveFailed]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        connection === "connected" ||
        connection === "connecting" ||
        saving ||
        saveFailed
      )
        event.preventDefault();
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [connection, saving, saveFailed]);

  const [currentUtterance, setCurrentUtterance] = useState("");
  const utteranceItemRef = useRef("");
  const savedUtterancesRef = useRef(new Set<string>());
  const baseInstructionsRef = useRef("");
  const focusRef = useRef(learningFocus);
  useEffect(() => {
    focusRef.current = learningFocus;
  }, [learningFocus]);
  useEffect(() => {
    if (connection !== "connected") return;
    // Send settled model changes, not one configuration update for every slider frame.
    const timer = window.setTimeout(() => {
      if (
        sessionRef.current?.transport.status === "connected" &&
        baseInstructionsRef.current
      ) {
        sessionRef.current.transport.updateSessionConfig({
          instructions: withLearningFocus(
            baseInstructionsRef.current,
            learningFocus,
          ),
        });
      }
    }, 150);
    return () => window.clearTimeout(timer);
  }, [learningFocus, connection]);
  const sessionRef = useRef<RealtimeSession | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const tutorSessionIdRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputProbeRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const isAwakeRef = useRef(false);
  const inputItemRef = useRef<string | null>(null);
  const inputTranscriptRef = useRef("");
  const inputLogprobsRef = useRef<TranscriptionLogprob[]>([]);

  const setWakeState = useCallback((awake: boolean) => {
    if (isAwakeRef.current === awake) return;
    isAwakeRef.current = awake;
    setIsAwake(awake);
    const session = sessionRef.current;
    if (session?.transport.status === "connected") {
      session.transport.updateSessionConfig({
        audio: { input: { turnDetection: listeningModeConfig(awake) } },
      });
    }
  }, []);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  const appendTranscript = useCallback(
    (role: TranscriptLine["role"], text: string) => {
      if (!text.trim()) return;
      setTranscript((previous) => [
        ...previous.slice(-499),
        {
          role,
          text: text.trim().slice(0, 10000),
          timestamp: new Date().toISOString(),
        },
      ]);
    },
    [],
  );

  const startVisualizer = useCallback(
    (_inputStream: MediaStream, audioElement: HTMLAudioElement) => {
      // Inspect the remote audio without routing or duplicating playback.
      const context = new AudioContext({ latencyHint: "interactive" });
      audioContextRef.current = context;
      void context.resume().catch(() => undefined);
      outputProbeRef.current = window.setInterval(() => {
        const stream = audioElement.srcObject;
        if (
          !(stream instanceof MediaStream) ||
          !stream.getAudioTracks().length ||
          outputAnalyserRef.current
        )
          return;
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(stream).connect(analyser);
        outputAnalyserRef.current = analyser;
        if (outputProbeRef.current !== null)
          window.clearInterval(outputProbeRef.current);
        outputProbeRef.current = null;
      }, 80);
    },
    [],
  );

  const cleanup = useCallback(async () => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      try {
        await session.close();
      } catch {
        // The transport may already be closed.
      }
    }
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    if (outputProbeRef.current !== null)
      window.clearInterval(outputProbeRef.current);
    outputProbeRef.current = null;

    outputAnalyserRef.current = null;
    await audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  }, []);

  const endSession = useCallback(async () => {
    setSaving(true);
    setSaveFailed(false);
    await cleanup();
    setConnection("idle");
    setIsSpeaking(false);
    setIsMuted(false);
    setWakeState(false);
    if (tutorSessionIdRef.current) {
      try {
        await api.endSession(
          createSessionPayload(
            tutorSessionIdRef.current,
            lessonTitle,
            transcript,
          ),
        );
        tutorSessionIdRef.current = null;
        setError(null);
        setEnded(true);
      } catch {
        setSaveFailed(true);
        setError(
          "Your microphone is off, but the session couldn’t save. Retry saving before you leave.",
        );
      }
    }
    setSaving(false);
  }, [cleanup, lessonTitle, setWakeState, transcript]);

  const connect = useCallback(async () => {
    if (connection === "connecting" || connection === "connected") return;
    setError(null);
    setTranscript([]);
    setCurrentUtterance("");
    utteranceItemRef.current = "";
    savedUtterancesRef.current.clear();
    setEnded(false);
    setWakeState(false);
    inputItemRef.current = null;
    inputTranscriptRef.current = "";
    inputLogprobsRef.current = [];
    setConnection("connecting");

    try {
      const mediaStream = await requestMicrophone();
      if (!mountedRef.current) {
        mediaStream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = mediaStream;

      const secret = await api.clientSecret(lessonId);
      if (
        secret.lessonId !== lessonId ||
        !secret.instructions.includes("[SELECTED_LESSON:")
      ) {
        throw new Error(
          "The voice session did not receive the selected lesson context.",
        );
      }
      if (!mountedRef.current) {
        await cleanup();
        return;
      }

      const audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      audioElement.setAttribute("playsinline", "");
      audioRef.current = audioElement;
      startVisualizer(mediaStream, audioElement);

      baseInstructionsRef.current = secret.instructions;
      const transport = new OpenAIRealtimeWebRTC({ mediaStream, audioElement });
      const agent = new RealtimeAgent({
        name: "Atticus Tutor",
        instructions: withLearningFocus(secret.instructions, focusRef.current),
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
              noiseReduction: { type: "near_field" },
              transcription: {
                model: "gpt-live-transcribe",
                delay: "minimal",
                keywords: ["Virgil"],
              },
              turnDetection: listeningModeConfig(false),
            },
          },
        },
      });

      session.on("error", () => {
        setError(
          "Virgil hit a connection problem. Try your question again, or end the session and reconnect.",
        );
      });
      transport.on("connection_change", (state) => {
        if (state === "disconnected" && sessionRef.current === session) {
          void cleanup();
          setConnection("error");
          setIsSpeaking(false);
          setSaveFailed(Boolean(tutorSessionIdRef.current));
          setError(
            tutorSessionIdRef.current
              ? "The connection ended. Your microphone is off. Save your session below before reconnecting."
              : "The connection ended. Your microphone is off. Try connecting again.",
          );
        }
      });
      session.on(
        "transport_event",
        (event: {
          type?: string;
          transcript?: string;
          text?: string;
          delta?: string;
          item_id?: string;
          logprobs?: TranscriptionLogprob[] | null;
        }) => {
          const type = event.type ?? "";
          const playing = playbackState(isSpeakingRef.current, type);
          if (playing !== isSpeakingRef.current) {
            isSpeakingRef.current = playing;
            setIsSpeaking(playing);
          }
          if (type === "response.created") setCurrentUtterance("");
          if (
            [
              "response.output_audio_transcript.delta",
              "response.audio_transcript.delta",
            ].includes(type) &&
            event.delta
          ) {
            const item = event.item_id ?? "current-output";
            if (utteranceItemRef.current !== item) {
              utteranceItemRef.current = item;
              setCurrentUtterance(event.delta);
            } else
              setCurrentUtterance((previous) =>
                (previous + event.delta).slice(-10000),
              );
          }
          if (
            [
              "response.output_audio_transcript.done",
              "response.audio_transcript.done",
            ].includes(type) &&
            event.transcript
          ) {
            const key = event.item_id ?? event.transcript;
            if (!savedUtterancesRef.current.has(key)) {
              savedUtterancesRef.current.add(key);
              appendTranscript("assistant", event.transcript);
            }
            setCurrentUtterance(event.transcript);
          }
          if (
            type === "conversation.item.input_audio_transcription.delta" &&
            event.delta
          ) {
            const itemId = event.item_id ?? "current-input";
            if (inputItemRef.current !== itemId) {
              inputItemRef.current = itemId;
              inputTranscriptRef.current = "";
              inputLogprobsRef.current = [];
            }
            inputTranscriptRef.current += event.delta;
            if (event.logprobs?.length) {
              inputLogprobsRef.current.push(...event.logprobs);
            }
            if (
              !isAwakeRef.current &&
              hasConfidentWakeWord(
                inputTranscriptRef.current,
                inputLogprobsRef.current,
              )
            ) {
              setWakeState(true);
            }
            if (
              isSpeakingRef.current &&
              containsConfirmedSpeech(inputTranscriptRef.current)
            ) {
              sessionRef.current?.interrupt();
              isSpeakingRef.current = false;
              setIsSpeaking(false);
              inputTranscriptRef.current = "";
            }
          }
          if (
            type.includes("input_audio_transcription.completed") &&
            event.transcript
          ) {
            inputItemRef.current = null;
            inputTranscriptRef.current = "";
            inputLogprobsRef.current = [];
            appendTranscript("user", event.transcript);
            if (isAwakeRef.current && GOODBYE_PATTERN.test(event.transcript)) {
              setWakeState(false);
            } else if (
              hasConfidentWakeWord(
                event.transcript,
                event.logprobs ?? undefined,
              )
            ) {
              const activatedFromCompletedTranscript = !isAwakeRef.current;
              setWakeState(true);
              if (activatedFromCompletedTranscript) {
                sessionRef.current?.transport.requestResponse?.();
              }
            }
          }
        },
      );

      session.on("audio_interrupted", () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      });
      sessionRef.current = session;
      let connectTimeout = 0;
      try {
        await Promise.race([
          session.connect({ apiKey: secret.value }),
          new Promise<never>((_resolve, reject) => {
            connectTimeout = window.setTimeout(
              () =>
                reject(
                  new Error(
                    "Connecting took too long. Check your connection and try again.",
                  ),
                ),
              30_000,
            );
          }),
        ]);
      } finally {
        window.clearTimeout(connectTimeout);
      }
      if (!mountedRef.current) {
        await cleanup();
        return;
      }
      const started = await api.tool.lessonStarted(lessonId);
      tutorSessionIdRef.current = started.sessionId;
      if (sessionRef.current !== session) {
        setSaveFailed(true);
        return;
      }
      setConnection("connected");
    } catch (caught) {
      await cleanup();
      setError(voiceStartupError(caught));
      setConnection("error");
    }
  }, [
    appendTranscript,
    cleanup,
    connection,
    lessonId,
    setWakeState,
    startVisualizer,
  ]);

  const toggleMute = useCallback(async () => {
    const session = sessionRef.current;
    if (!session) return;
    const next = !isMuted;
    try {
      await session.mute(next);
      setIsMuted(next);
    } catch {
      setError(
        "The microphone control didn’t respond. End the session to disconnect safely.",
      );
    }
  }, [isMuted]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      void cleanup();
    };
  }, [cleanup]);

  const status =
    connection === "connecting"
      ? "Allow microphone access to continue"
      : connection === "connected"
        ? isMuted
          ? "Microphone muted"
          : isSpeaking
            ? "Virgil is speaking"
            : isAwake
              ? "Listening"
              : "Say “Virgil” to begin"
        : error
          ? "Let’s try that again"
          : ended
            ? "Session saved. Nice thinking."
            : "Ready when you are";

  return (
    <section
      className={`voice-stage ${isSpeaking ? "voice-stage--speaking" : ""}`}
      aria-label="Virgil voice tutor"
    >
      <div className="section-top">
        <span className="eyebrow">YOUR AI THINKING PARTNER</span>
        <Icon name="headphones" size={18} />
      </div>
      <VirgilAvatar
        state={
          connection === "connecting"
            ? "connecting"
            : connection === "error"
              ? "error"
              : isSpeaking
                ? "speaking"
                : isMuted
                  ? "muted"
                  : connection === "connected"
                    ? "listening"
                    : "idle"
        }
        analyser={outputAnalyserRef}
        active={connection === "connected"}
      />
      <h2>One thought at a time.</h2>
      {currentUtterance && (
        <div className="live-utterance" aria-label="Virgil’s latest words">
          <span>VIRGIL</span>
          <p>{currentUtterance}</p>
        </div>
      )}
      <div className="voice-hud" role="status">
        <span className={`voice-status-dot voice-status-dot--${connection}`} />
        <span>{status}</span>
      </div>
      {(connection === "idle" || connection === "error") && !saveFailed && (
        <button
          className="button primary"
          onClick={() => void connect()}
          disabled={saving}
        >
          <Icon name="mic" size={17} />
          {saving
            ? "Saving your session…"
            : ended
              ? "Start another conversation"
              : "Connect microphone"}
        </button>
      )}
      {connection === "connecting" && (
        <p className="voice-instruction">
          Connecting… Allow microphone access if your browser asks.
        </p>
      )}
      {connection === "connected" && (
        <p className="voice-instruction">
          {isMuted
            ? "Unmute when you’re ready to continue."
            : "Say “Virgil”, then ask your question. You can interrupt to ask for help."}
        </p>
      )}

      {connection === "connected" && (
        <nav className="voice-controls" aria-label="Voice session controls">
          <button
            className="button outline"
            type="button"
            aria-pressed={isMuted}
            onClick={() => void toggleMute()}
          >
            <Icon name={isMuted ? "mute" : "mic"} size={16} />
            {isMuted ? "Unmute" : "Mute"}
          </button>
          <button
            className="button dark"
            type="button"
            onClick={() => void endSession()}
          >
            End session
          </button>
        </nav>
      )}

      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {saveFailed && (
        <>
          <button
            className="button outline"
            onClick={() => void endSession()}
            disabled={saving}
          >
            Retry saving session
          </button>
          <button
            className="text-button"
            onClick={() => {
              setSaveFailed(false);
              tutorSessionIdRef.current = null;
              setError(
                "Session ended without saving. You can now return to your day.",
              );
            }}
          >
            Continue without saving
          </button>
        </>
      )}
      <button
        className="transcript-toggle"
        onClick={() => setShowTranscript(!showTranscript)}
        aria-expanded={showTranscript}
      >
        <Icon name="book" size={16} />
        {showTranscript ? "Hide" : "Show"} conversation
      </button>
      {showTranscript && (
        <div
          className="transcript-panel"
          role="log"
          aria-label="Conversation transcript"
        >
          {transcript.length ? (
            transcript.map((line, index) => (
              <div className={`transcript-line ${line.role}`} key={index}>
                <strong>{line.role === "user" ? "You" : "Virgil"}</strong>
                <p>{line.text}</p>
              </div>
            ))
          ) : (
            <p>Your words will appear here after you connect and speak.</p>
          )}
        </div>
      )}
      <small className="voice-privacy">
        {connection === "connected"
          ? isMuted
            ? "Microphone muted · Session connected"
            : "Microphone on · Session connected"
          : connection === "connecting"
            ? "Microphone setup in progress"
            : "Microphone off"}
        . AI can make mistakes; ask how and why.
      </small>
    </section>
  );
}
