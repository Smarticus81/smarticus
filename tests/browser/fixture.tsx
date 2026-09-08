import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../../client/src/App";
import { VirgilAvatar } from "../../client/src/voice/VirgilAvatar";
import { speechEnergy } from "../../client/src/voice/speechSignal";
import "../../client/src/styles/global.css";
import "../../client/src/styles/lessons.css";

function AudioFixture() {
  const analyser = useRef<AnalyserNode | null>(null),
    context = useRef<AudioContext | null>(null),
    gain = useRef<GainNode | null>(null);
  const [active, setActive] = useState(false),
    [playing, setPlaying] = useState(false),
    [energy, setEnergy] = useState(0);
  useEffect(() => {
    if (!active) {
      setEnergy(0);
      return;
    }
    let frame = 0;
    const samples = new Uint8Array(512);
    const read = () => {
      analyser.current?.getByteTimeDomainData(samples);
      setEnergy(speechEnergy(samples));
      frame = requestAnimationFrame(read);
    };
    frame = requestAnimationFrame(read);
    return () => cancelAnimationFrame(frame);
  }, [active]);
  const stop = () => {
    analyser.current = null;
    void context.current?.close();
    context.current = null;
    setActive(false);
    setPlaying(false);
  };
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  async function start(speech = false) {
    const audio = new AudioContext();
    context.current = audio;
    await audio.resume();
    let source: AudioScheduledSourceNode;
    if (speech) {
      const response = await fetch("/tests/browser/assets/speech.wav");
      const buffer = await audio.decodeAudioData(await response.arrayBuffer());
      const spoken = audio.createBufferSource();
      spoken.buffer = buffer;
      spoken.onended = () => setPlaying(false);
      source = spoken;
    } else {
      const tone = audio.createOscillator();
      tone.frequency.value = 180;
      source = tone;
    }
    const volume = audio.createGain();
    gain.current = volume;
    volume.gain.value = speech ? 1 : 0.25;
    const remote = audio.createMediaStreamDestination();
    source.connect(volume).connect(remote);
    source.start();
    const probe = audio.createAnalyser();
    probe.fftSize = 512;
    audio.createMediaStreamSource(remote.stream).connect(probe);
    analyser.current = probe;
    setActive(true);
    setPlaying(true);
  }
  return (
    <main
      className="zen-workspace"
      style={{ maxWidth: 600, margin: "50px auto", padding: 30 }}
    >
      <h1>Output audio synchronization check</h1>
      <p>
        This isolated fixture feeds an actual MediaStream through the same Web
        Audio analysis path. It never connects a microphone or calls an AI
        service.
      </p>
      <VirgilAvatar
        state={playing ? "speaking" : "idle"}
        analyser={analyser}
        active={active}
      />
      <output data-testid="source-energy">{energy}</output>
      <button onClick={() => void start()} disabled={active}>
        Start output
      </button>
      <button onClick={() => void start(true)} disabled={active}>
        Play speech sample
      </button>
      <button
        disabled={!active}
        onClick={() => {
          gain.current!.gain.value = 0;
          setPlaying(false);
        }}
      >
        Silence output
      </button>
      <button
        disabled={!active}
        onClick={() => {
          gain.current!.gain.value = 0.25;
          setPlaying(true);
        }}
      >
        Resume output
      </button>
      <button disabled={!active} onClick={stop}>
        Disconnect output
      </button>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  new URLSearchParams(location.search).get("fixture") === "avatar" ? (
    <AudioFixture />
  ) : (
    <App />
  ),
);
