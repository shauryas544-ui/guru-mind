import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { SPEECH_CODES } from "@/lib/language";
import { api } from "@/services/api";

type WebSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextCtor(): AudioContextCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext
  );
}

function encodePcm16Wav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const byteLength = samples.length * 2;
  const buffer = new ArrayBuffer(44 + byteLength);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + byteLength, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // PCM format
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, byteLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

/**
 * Converts browser-recorded MediaRecorder blobs (typically audio/webm) into
 * 16kHz mono 16-bit PCM WAV so Gnani Vachana /stt/v3 accepts every recording.
 */
async function convertBlobToWav(blob: Blob): Promise<Blob> {
  if ((blob.type || "").toLowerCase().includes("wav")) {
    return blob;
  }

  const Ctor = getAudioContextCtor();
  if (!Ctor) return blob;

  const ctx = new Ctor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const targetSampleRate = 16000;
    const frameCount = Math.max(1, Math.ceil(decoded.duration * targetSampleRate));

    let monoSamples: Float32Array;
    if (typeof OfflineAudioContext !== "undefined") {
      const offline = new OfflineAudioContext(1, frameCount, targetSampleRate);
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.connect(offline.destination);
      source.start(0);
      const rendered = await offline.startRendering();
      monoSamples = rendered.getChannelData(0);
    } else {
      const ch0 = decoded.getChannelData(0);
      const ratio = decoded.sampleRate / targetSampleRate;
      const len = Math.max(1, Math.floor(ch0.length / ratio));
      monoSamples = new Float32Array(len);
      for (let i = 0; i < len; i++) {
        monoSamples[i] = ch0[Math.min(ch0.length - 1, Math.floor(i * ratio))] ?? 0;
      }
    }

    const wavBuffer = encodePcm16Wav(monoSamples, targetSampleRate);
    return new Blob([wavBuffer], { type: "audio/wav" });
  } catch {
    return blob;
  } finally {
    ctx.close().catch(() => {});
  }
}

export function useGnaniVoice(options: {
  language?: string;
  voice?: string;
  autoStopOnSilence?: boolean;
  onTranscript: (text: string) => void;
  onVoiceError?: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const speechRecRef = useRef<WebSpeechRecognition | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const speakOnEndedRef = useRef<(() => void) | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  const meterTimerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const peakLevelRef = useRef<number>(0);
  const cancelNextRef = useRef<boolean>(false);
  const startingRef = useRef<boolean>(false);
  const unmountedRef = useRef(false);

  const onTranscriptRef = useRef(options.onTranscript);
  onTranscriptRef.current = options.onTranscript;
  const onVoiceErrorRef = useRef(options.onVoiceError);
  onVoiceErrorRef.current = options.onVoiceError;
  const autoStopRef = useRef(Boolean(options.autoStopOnSilence));
  autoStopRef.current = Boolean(options.autoStopOnSilence);

  const cleanupMeter = useCallback(() => {
    if (meterTimerRef.current !== null && typeof window !== "undefined") {
      window.clearInterval(meterTimerRef.current);
      meterTimerRef.current = null;
    }
    if (meterCtxRef.current) {
      meterCtxRef.current.close().catch(() => {});
      meterCtxRef.current = null;
    }
    if (!unmountedRef.current) {
      setAudioLevel(0);
      setRecordingSeconds(0);
    }
  }, []);

  const stopAudioPlayback = useCallback(() => {
    speakOnEndedRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (typeof window !== "undefined") {
      window.speechSynthesis?.cancel();
    }
    if (!unmountedRef.current) {
      setSpeaking(false);
    }
  }, []);

  useEffect(() => {
    unmountedRef.current = false;
    if (typeof window !== "undefined") {
      window.speechSynthesis?.getVoices?.();
    }
    return () => {
      unmountedRef.current = true;
      cleanupMeter();
      stopAudioPlayback();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        speechRecRef.current?.stop();
      } catch {
        // ignore inactive speech recognition cleanup
      }
    };
  }, [cleanupMeter, stopAudioPlayback]);

  const fallbackBrowserSpeechRecognition = useCallback((lang: string) => {
    const W = window as unknown as {
      SpeechRecognition?: new () => WebSpeechRecognition;
      webkitSpeechRecognition?: new () => WebSpeechRecognition;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      toast.error("Voice recognition is not supported in this browser.");
      onVoiceErrorRef.current?.();
      return;
    }

    const rec = new Ctor();
    rec.lang = SPEECH_CODES[lang] ?? "en-IN";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript && !unmountedRef.current) onTranscriptRef.current(transcript);
    };
    rec.onend = () => {
      if (!unmountedRef.current) setRecording(false);
    };
    rec.onerror = () => {
      if (!unmountedRef.current) {
        setRecording(false);
        toast.error("Could not hear speech clearly. Please try again.");
        onVoiceErrorRef.current?.();
      }
    };
    speechRecRef.current = rec;
    try {
      rec.start();
      setRecording(true);
    } catch {
      setRecording(false);
      toast.error("Could not start browser speech recognition.");
      onVoiceErrorRef.current?.();
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    try {
      speechRecRef.current?.stop();
    } catch {
      // ignore if speech recognition already stopped
    }
    setRecording(false);
  }, []);

  const cancelRecording = useCallback(() => {
    cancelNextRef.current = true;
    stopRecording();
  }, [stopRecording]);

  const startRecording = useCallback(async () => {
    if (recording || startingRef.current || transcribing) return;

    startingRef.current = true;
    cancelNextRef.current = false;
    stopAudioPlayback();
    const lang = options.language || "English";

    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      startingRef.current = false;
      fallbackBrowserSpeechRecognition(lang);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (unmountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = stream;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      peakLevelRef.current = 0;

      // Setup live level meter + optional silence auto-stop
      const CtxCtor = getAudioContextCtor();
      if (CtxCtor && typeof window !== "undefined") {
        try {
          const ctx = new CtxCtor();
          const source = ctx.createMediaStreamSource(stream);
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 1024;
          source.connect(analyser);
          meterCtxRef.current = ctx;

          const data = new Uint8Array(analyser.fftSize);
          let heardSpeech = false;
          let silenceStartedAt: number | null = null;

          meterTimerRef.current = window.setInterval(() => {
            if (
              unmountedRef.current ||
              !recorderRef.current ||
              recorderRef.current.state !== "recording"
            ) {
              return;
            }
            analyser.getByteTimeDomainData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) {
              const v = ((data[i] ?? 128) - 128) / 128;
              sum += v * v;
            }
            const rms = Math.sqrt(sum / data.length);
            const normalized = Math.min(1, rms * 5);
            if (rms > peakLevelRef.current) peakLevelRef.current = rms;
            setAudioLevel(normalized);

            const elapsedMs = Date.now() - startedAtRef.current;
            setRecordingSeconds(Math.floor(elapsedMs / 1000));

            if (autoStopRef.current) {
              if (rms > 0.024) {
                heardSpeech = true;
                silenceStartedAt = null;
              } else if (heardSpeech) {
                if (silenceStartedAt === null) {
                  silenceStartedAt = Date.now();
                } else if (elapsedMs >= 800 && Date.now() - silenceStartedAt >= 850) {
                  stopRecording();
                }
              }
            }
          }, 80);
        } catch {
          // Audio level meter is optional; recording still proceeds cleanly
        }
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        const elapsedMs = Date.now() - startedAtRef.current;
        const peakRms = peakLevelRef.current;
        const wasCancelled = cancelNextRef.current;
        cancelNextRef.current = false;

        cleanupMeter();
        stream.getTracks().forEach((t) => t.stop());
        if (unmountedRef.current) return;
        setRecording(false);

        if (wasCancelled) return;

        const rawBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (rawBlob.size < 400 || elapsedMs < 350) {
          toast.error("Recording too short — tap mic, speak clearly, then tap to send.");
          onVoiceErrorRef.current?.();
          return;
        }

        setTranscribing(true);
        try {
          const uploadBlob = await convertBlobToWav(rawBlob);
          const result = await api.transcribeVoice(uploadBlob, "indic-auto");
          if (unmountedRef.current) return;

          if (result.transcript) {
            onTranscriptRef.current(result.transcript);
          } else {
            toast.error(
              peakRms < 0.012
                ? "No sound captured — check that your microphone is unmuted."
                : "Could not catch clear speech. Please speak a bit closer and try again.",
            );
            onVoiceErrorRef.current?.();
          }
        } catch (err) {
          if (unmountedRef.current) return;
          const msg = err instanceof Error ? err.message : "";
          if (/not configured/i.test(msg)) {
            toast.info("Gnani Voice key not set on server — using browser voice.");
            fallbackBrowserSpeechRecognition(lang);
          } else {
            toast.error(msg || "Voice transcription failed.");
            onVoiceErrorRef.current?.();
          }
        } finally {
          if (!unmountedRef.current) setTranscribing(false);
        }
      };

      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err) {
      cleanupMeter();
      const name = (err as { name?: string })?.name;
      if (name === "NotFoundError") {
        toast.error("No microphone detected. Please connect a microphone.");
      } else {
        toast.error("Microphone permission is blocked. Allow microphone access in your browser.");
      }
      onVoiceErrorRef.current?.();
    } finally {
      startingRef.current = false;
    }
  }, [
    recording,
    transcribing,
    options.language,
    stopAudioPlayback,
    fallbackBrowserSpeechRecognition,
    cleanupMeter,
    stopRecording,
  ]);

  const toggleRecording = useCallback(async () => {
    if (recording) {
      stopRecording();
      return;
    }
    await startRecording();
  }, [recording, stopRecording, startRecording]);

  const speak = useCallback(
    async (text: string, enabled = true, onFinished?: () => void) => {
      if (!enabled || !text.trim()) {
        onFinished?.();
        return;
      }
      stopAudioPlayback();
      speakOnEndedRef.current = onFinished ?? null;

      const finishPlayback = () => {
        const cb = speakOnEndedRef.current;
        stopAudioPlayback();
        cb?.();
      };

      try {
        setSpeaking(true);
        const blob = await api.synthesizeVoice({
          text,
          language: options.language || "English",
          voice: options.voice,
        });
        if (unmountedRef.current) return;
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = finishPlayback;
        audio.onerror = () => stopAudioPlayback();
        await audio.play();
      } catch {
        if (unmountedRef.current) return;
        if (typeof window !== "undefined" && window.speechSynthesis) {
          const clean = text.replace(/[*_#`>]/g, "");
          const utter = new SpeechSynthesisUtterance(clean);
          utter.lang = SPEECH_CODES[options.language || "English"] ?? "en-IN";
          utter.onend = () => {
            if (!unmountedRef.current) finishPlayback();
          };
          utter.onerror = () => {
            if (!unmountedRef.current) stopAudioPlayback();
          };
          window.speechSynthesis.speak(utter);
        } else {
          stopAudioPlayback();
        }
      }
    },
    [options.language, options.voice, stopAudioPlayback],
  );

  return {
    recording,
    transcribing,
    speaking,
    audioLevel,
    recordingSeconds,
    startRecording,
    stopRecording,
    cancelRecording,
    toggleRecording,
    speak,
    stopAudioPlayback,
  };
}
