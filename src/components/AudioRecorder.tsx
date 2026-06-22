/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, UploadCloud, FileAudio, AlertCircle, Sparkles, Brain, Tv, Volume2, FileDown, Check, Send, HelpCircle, GraduationCap, Search, ArrowRight, Loader2, Cpu, Clock } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";
import { isBrowserWhisperSupported, transcribePcmInBrowser, warmupBrowserWhisper } from "../lib/browserWhisper";
import { cleanTextForExport } from "../lib/textCleanup";
import { buildAcademicTranscriptSegments } from "../lib/transcriptSegments";

interface AudioRecorderProps {
  onTranscriptionSuccess: (transcription: { id?: string; title: string; transcript: string; summary: string }, durationSec: number) => void;
  settings: { aiProvider: string; apiKey?: string; hasApiKey?: boolean; bypassSizeLimit?: boolean };
  onUpdateDraft?: (draft: { id: string; title: string; transcript: string; summary: string; duration: string; isDraft?: boolean; date?: string }) => void;
  initialMode?: "record" | "upload";
}

const MAX_RECORDING_SECONDS = 2 * 60 * 60;
const RECORDING_WARNING_SECONDS = MAX_RECORDING_SECONDS - 10 * 60;

export default function AudioRecorder({ onTranscriptionSuccess, settings, onUpdateDraft, initialMode }: AudioRecorderProps) {
  // Tabs: "record" or "upload"
  const [activeMode, setActiveMode] = useState<"record" | "upload">(initialMode || "record");

  useEffect(() => {
    if (initialMode) {
      setActiveMode(initialMode);
    }
  }, [initialMode]);

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [longSessionNotice, setLongSessionNotice] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");
  const [captureSource, setCaptureSource] = useState<"mic" | "screen">("mic");
  const [isFirefox, setIsFirefox] = useState(false);
  const [isSafari, setIsSafari] = useState(false);
  
  // Dynamic Live Draft ID and sync state
  const currentDraftIdRef = useRef<string | null>(null);
  const [isSyncingDraft, setIsSyncingDraft] = useState(false);
  const [draftWordCount, setDraftWordCount] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined" && navigator.userAgent) {
      const ua = navigator.userAgent.toLowerCase();
      setIsFirefox(ua.includes("firefox"));
      setIsSafari(/^((?!chrome|android).)*safari/i.test(ua));
    }
  }, []);

  // Live real-time speech states
  const [liveTranscript, setLiveTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isDigitalLiveTranscribing, setIsDigitalLiveTranscribing] = useState(false);
  const [digitalLiveEnabled, setDigitalLiveEnabled] = useState(false);
  const [digitalAudioDebug, setDigitalAudioDebug] = useState("");

  // Live Copilot chat states
  const [isCopilotActive, setIsCopilotActive] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string; timestamp?: string }>>([
    {
      role: "assistant",
      content: "Copiloto de preguntas listo. Activalo cuando quieras detectar preguntas del profesor o escribir rapidamente la pregunta que te hicieron.",
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isChatSending, setIsChatSending] = useState(false);
  const [detectedQuestions, setDetectedQuestions] = useState<string[]>([]);
  const [isDetectingQuestions, setIsDetectingQuestions] = useState(false);

  // Helper to auto-extract quick professor questions without turning live mode into Explore.
  const autoDetectQuestionsFromText = (text: string) => {
    const regex = /[¿?]?\b((?:que|qu\u00e9|cual|cu\u00e1l|cuantos|cu\u00e1ntos|por que|por qu\u00e9|como|c\u00f3mo|quien|qui\u00e9n|alguien)\b[^.?!]{8,140})\?/gi;
    const questions: string[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const q = match[1].trim();
      if (q.length > 5 && q.length < 150) {
        questions.push(`¿${q}?`);
      }
    }
    const words = text.toLowerCase();
    const keywords = [
      "quien me dice",
      "quién me dice",
      "alguien sabe",
      "quien sabe",
      "qué significa",
      "que significa",
      "cuantos",
      "cuántos",
      "cual es",
      "cuál es",
    ];
    keywords.forEach(kw => {
      if (words.includes(kw)) {
        const idx = words.indexOf(kw);
        const sentence = text.substring(Math.max(0, idx - 10), Math.min(text.length, idx + 130)).split(/[.\n]/)[0].trim();
        if (sentence && !questions.includes(sentence)) {
          questions.push(sentence.endsWith("?") ? sentence : `${sentence}?`);
        }
      }
    });
    return Array.from(new Set(questions)).slice(-5);
  };

  // Listen to liveTranscript only when the questions copilot is ON.
  useEffect(() => {
    if (!isCopilotActive || !liveTranscript) return;
    const questions = autoDetectQuestionsFromText(liveTranscript);
    if (questions.length > 0) {
      setDetectedQuestions((prev) => {
        const combined = Array.from(new Set([...prev, ...questions]));
        return combined.slice(-5);
      });
    }
  }, [isCopilotActive, liveTranscript]);

  const handleSendLiveChat = async (questionText: string) => {
    if (!questionText.trim()) return;
    
    const userMsg = {
      role: "user" as const,
      content: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    };
    
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsChatSending(true);

    try {
      const currentTranscript = liveTranscriptRef.current || liveTranscript || "(Silencio por ahora)";
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: currentTranscript,
          messages: chatMessages.filter(m => m.content !== "¡Hola! ..."),
          userMessage: questionText
        })
      });

      if (!response.ok) {
        throw new Error("No se pudo obtener la respuesta del Copiloto AI.");
      }

      const data = await response.json();
      
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.response || "No tengo suficiente contexto para responder a eso todavía.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `⚠️ Error de conexión: ${err.message || "No se pudo comunicar con el asistente."}`,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        }
      ]);
    } finally {
      setIsChatSending(false);
    }
  };

  const scanClassroomQuestionsWithAI = async () => {
    const currentTranscript = liveTranscriptRef.current || liveTranscript;
    if (!currentTranscript || currentTranscript.trim().length < 15) {
      setErrorMessage("La transcripción es muy corta para detectar preguntas del profesor. ¡Sigue hablando o grabando primero!");
      return;
    }

    setIsDetectingQuestions(true);
    try {
      const scanPrompt = "Identifica hasta 3 preguntas explicitas que el profesor u orador haya formulado para que un estudiante responda. No incluyas resumenes, tareas, conceptos sueltos, temas de clase ni actividades. Devuelve solo una lista en espanol, una pregunta por linea, cada linea empezando por guion (-). Si no hay preguntas reales, devuelve una lista vacia.";
      
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: currentTranscript,
          userMessage: scanPrompt
        })
      });

      if (!response.ok) throw new Error("Fallo al escanear preguntas.");
      const data = await response.json();
      
      const text = data.response || "";
      const foundQuestions = text
        .split("\n")
        .map((line: string) => line.trim())
        .filter((line: string) => line.startsWith("-") || line.startsWith("*"))
        .map((line: string) => line.replace(/^[-*]\s*/, "").trim())
        .filter((q: string) => q.length > 5);

      if (foundQuestions.length > 0) {
        setDetectedQuestions((prev) => {
          const combined = Array.from(new Set([...prev, ...foundQuestions]));
          return combined.slice(-5);
        });
      } else {
        setErrorMessage("Todavía no se detectan preguntas o dudas explícitas en los últimos párrafos grabados.");
      }
    } catch (err: any) {
      console.warn("AI Question scan failed:", err);
      setErrorMessage("No se pudo escanear preguntas con IA en este momento.");
    } finally {
      setIsDetectingQuestions(false);
    }
  };

  // Cumulative speech recognition trackers
  const sessionFinalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
  const [speechErrorNotice, setSpeechErrorNotice] = useState<string | null>(null);
  const isRecordingRef = useRef(false);
  const isPausedRef = useRef(false);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const [failedSessionData, setFailedSessionData] = useState<{
    transcript: string;
    durationSec: number;
  } | null>(null);

  // Refs for audio capturing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognitionRef = useRef<any>(null);
  const stopRecordingRef = useRef<() => void>();
  const digitalLivePcmChunksRef = useRef<Float32Array[]>([]);
  const digitalLivePcmSampleCountRef = useRef(0);
  const digitalLiveSampleRateRef = useRef(48000);
  const digitalLiveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const digitalLivePeakRef = useRef(0);
  const digitalLiveDebugLastUpdateRef = useRef(0);
  const digitalLiveLastFlushRef = useRef(0);
  const digitalLiveBusyRef = useRef(false);
  const digitalLiveEnabledRef = useRef(false);

  const durationRef = useRef(0);
  const warningNotificationSentRef = useRef(false);
  const maxDurationStopSentRef = useRef(false);
  const captureSourceRef = useRef<"mic" | "screen">("mic");

  useEffect(() => {
    captureSourceRef.current = captureSource;
  }, [captureSource]);

  useEffect(() => {
    digitalLiveEnabledRef.current = digitalLiveEnabled;
  }, [digitalLiveEnabled]);

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  // File Upload states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const liveScrollRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Auto-scroll transcription window to bottom when new words arrive
  useEffect(() => {
    if (liveScrollRef.current) {
      liveScrollRef.current.scrollTop = liveScrollRef.current.scrollHeight;
    }
  }, [liveTranscript, interimTranscript]);

  // Auto-scroll chat window to bottom when new messages or typing indicators arrive/update
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, isChatSending]);

  // Clean-up refs on unmount
  useEffect(() => {
    return () => {
      stopTracksAndTimers();
    };
  }, []);

  const stopTracksAndTimers = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsDigitalLiveTranscribing(false);
    digitalLivePcmChunksRef.current = [];
    digitalLivePcmSampleCountRef.current = 0;
    digitalLivePeakRef.current = 0;
    digitalLiveDebugLastUpdateRef.current = 0;
    setDigitalAudioDebug("");
    digitalLiveBusyRef.current = false;
    digitalLiveLastFlushRef.current = 0;
    if (digitalLiveProcessorRef.current) {
      digitalLiveProcessorRef.current.disconnect();
      digitalLiveProcessorRef.current.onaudioprocess = null;
      digitalLiveProcessorRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
  };

  const requestDesktopNotificationPermission = async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.warn("Desktop notification permission request failed:", err);
      }
    }
  };

  const showRecordingDesktopNotice = (title: string, body: string) => {
    setLongSessionNotice(body);
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    try {
      new Notification(title, {
        body,
        tag: "olli-recording-limit",
        requireInteraction: true,
      });
    } catch (err) {
      console.warn("Desktop notification failed:", err);
    }
  };

  const syncDraftTick = (next: number) => {
    if (next % 1200 === 0 && onUpdateDraft && currentDraftIdRef.current) {
      setIsSyncingDraft(true);
      const m = Math.floor(next / 60);
      const s = next % 60;
      const liveDurationFormatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      onUpdateDraft({
        id: currentDraftIdRef.current,
        title: `Borrador en Vivo: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        transcript: liveTranscriptRef.current || "(Silencio grabado...)",
        summary: "### Borrador Guardado en Tiempo Real\n\nEste es un borrador auto-guardado mientras hablabas. Si la transcripción del audio pesado falla, puedes usar la opción de IA para resumir este borrador de texto directamente en tu bóveda.",
        duration: liveDurationFormatted,
        isDraft: true,
        date: new Date().toISOString()
      });
      setTimeout(() => {
        setIsSyncingDraft(false);
      }, 800);
    }
  };

  const handleRecordingDurationLimit = (next: number) => {
    if (next >= RECORDING_WARNING_SECONDS && !warningNotificationSentRef.current) {
      warningNotificationSentRef.current = true;
      showRecordingDesktopNotice(
        "Olli: quedan 10 minutos",
        "Quedan 10 minutos. Para clases más largas, crea una nueva grabación."
      );
    }

    if (next >= MAX_RECORDING_SECONDS && !maxDurationStopSentRef.current) {
      maxDurationStopSentRef.current = true;
      showRecordingDesktopNotice(
        "Olli guardó la grabación",
        "La grabación alcanzó el límite de 2 horas y se guardará automáticamente."
      );
      setTimeout(() => {
        if (stopRecordingRef.current) {
          stopRecordingRef.current();
        }
      }, 0);
    }
  };

  const startRecordingTimer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setDuration((prev) => {
        const next = prev + 1;
        durationRef.current = next;
        syncDraftTick(next);
        handleRecordingDurationLimit(next);
        return next;
      });
    }, 1000);
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = String(reader.result || "");
        resolve(result.split(",")[1] || "");
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const consumeDigitalPcmBuffer = () => {
    const chunks = digitalLivePcmChunksRef.current.splice(0);
    const totalSamples = digitalLivePcmSampleCountRef.current;
    digitalLivePcmSampleCountRef.current = 0;

    const merged = new Float32Array(totalSamples);
    let offset = 0;
    chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });

    return merged;
  };

  const getPcmStats = (audio: Float32Array) => {
    let sumSquares = 0;
    let peak = 0;

    for (let i = 0; i < audio.length; i += 1) {
      const value = Math.abs(audio[i]);
      sumSquares += audio[i] * audio[i];
      if (value > peak) peak = value;
    }

    return {
      rms: Math.sqrt(sumSquares / Math.max(1, audio.length)),
      peak,
    };
  };

  const looksLikeWhisperLoop = (text: string) => {
    const words = text.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length < 24) return false;

    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.34) return true;

    const grams = new Map<string, number>();
    for (let size = 3; size <= 6; size += 1) {
      grams.clear();
      for (let i = 0; i <= words.length - size; i += 1) {
        const key = words.slice(i, i + size).join(" ");
        const count = (grams.get(key) || 0) + 1;
        if (count >= 3) return true;
        grams.set(key, count);
      }
    }

    return false;
  };

  const cleanWhisperSegment = (text: string) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    if (!cleaned) return "";
    if (looksLikeWhisperLoop(cleaned)) return "";

    const words = cleaned.split(/\s+/).filter(Boolean);
    if (words.length > 120) return "";

    return cleaned;
  };

  const appendTranscriptSegment = (segment: string) => {
    const previous = liveTranscriptRef.current.trim();
    if (!previous) return segment;

    const previousWords = previous.split(/\s+/);
    const segmentWords = segment.split(/\s+/);
    const maxOverlap = Math.min(14, previousWords.length, segmentWords.length);

    for (let overlap = maxOverlap; overlap >= 4; overlap -= 1) {
      const previousTail = previousWords.slice(-overlap).join(" ").toLowerCase();
      const segmentHead = segmentWords.slice(0, overlap).join(" ").toLowerCase();
      if (previousTail === segmentHead) {
        return segmentWords.slice(overlap).join(" ");
      }
    }

    return segment;
  };

  const formatTranscriptTimestamp = (totalSeconds: number) => {
    const seconds = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  };

  const waitForDigitalLiveIdle = async () => {
    const deadline = Date.now() + 30_000;
    while (digitalLiveBusyRef.current && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 80));
    }
  };

  const flushDigitalLiveTranscript = async (force = false) => {
    if (!digitalLiveEnabledRef.current || captureSourceRef.current !== "screen") return;
    if (digitalLiveBusyRef.current) return;
    if (digitalLivePcmSampleCountRef.current === 0) return;

    const now = Date.now();
    if (!force && now - digitalLiveLastFlushRef.current < 8000) return;

      const audio = consumeDigitalPcmBuffer();
      digitalLiveLastFlushRef.current = now;
      digitalLiveBusyRef.current = true;
      setIsDigitalLiveTranscribing(true);
      setSpeechErrorNotice(null);

      try {
      const minSamples = Math.round(digitalLiveSampleRateRef.current * (force ? 3 : 6));
      if (audio.length < minSamples) {
        digitalLiveBusyRef.current = false;
        setIsDigitalLiveTranscribing(false);
        return;
      }
      const stats = getPcmStats(audio);
      if (stats.rms < 0.006 || stats.peak < 0.025) {
        setDigitalAudioDebug("Audio muy bajo para transcribir · sube volumen de la pestana");
        return;
      }

      const segmentStartedAt = Math.max(
        0,
        durationRef.current - audio.length / Math.max(1, digitalLiveSampleRateRef.current)
      );
      const transcript = cleanWhisperSegment(await transcribePcmInBrowser(audio, digitalLiveSampleRateRef.current));
      if (transcript) {
        const segment = appendTranscriptSegment(transcript);
        if (!segment.trim()) return;
        const marker = `[${formatTranscriptTimestamp(segmentStartedAt)}]`;
        const nextText = `${liveTranscriptRef.current ? `${liveTranscriptRef.current.trim()}\n` : ""}${marker} ${segment}`.trim();
        liveTranscriptRef.current = `${nextText} `;
        setLiveTranscript(liveTranscriptRef.current);
        setDraftWordCount(nextText.split(/\s+/).filter(Boolean).length);
      } else {
        setDigitalAudioDebug("Segmento descartado por repeticion o ruido");
      }
    } catch (error: any) {
      const message = error.message || "No se pudo transcribir el audio digital con Whisper local.";
      setSpeechErrorNotice(
        message.includes("Unable to decode audio data")
          ? "El navegador seguia usando el decodificador anterior. Recarga la pagina con Ctrl+F5 y vuelve a activar Whisper."
          : message
      );
    } finally {
      digitalLiveBusyRef.current = false;
      setIsDigitalLiveTranscribing(false);
    }
  };

  const toggleDigitalLiveTranscription = async () => {
    const next = !digitalLiveEnabledRef.current;

    if (next) {
      if (!isBrowserWhisperSupported()) {
        setSpeechErrorNotice("Este navegador no soporta Whisper local dentro de la web. Usa Chrome o Microsoft Edge actualizado.");
        return;
      }

      setSpeechErrorNotice("Cargando Whisper local dentro de la web. La primera vez puede tardar mientras se descarga el modelo.");
      await warmupBrowserWhisper();
      digitalLivePcmChunksRef.current = [];
      digitalLivePcmSampleCountRef.current = 0;
      digitalLivePeakRef.current = 0;
      digitalLiveDebugLastUpdateRef.current = 0;
      setDigitalAudioDebug("Whisper listo. Esperando audio de la pestana...");
      digitalLiveLastFlushRef.current = 0;
    } else {
      await flushDigitalLiveTranscript(true);
    }

    digitalLiveEnabledRef.current = next;
    setDigitalLiveEnabled(next);
    setSpeechErrorNotice(null);
  };

  // 1. Voice Visualizer
  const startVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);

      analyser.fftSize = 256;
      source.connect(analyser);

      if (captureSourceRef.current === "screen") {
        digitalLiveSampleRateRef.current = audioContext.sampleRate;
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (event) => {
          const output = event.outputBuffer.getChannelData(0);
          output.fill(0);

          if (!digitalLiveEnabledRef.current || captureSourceRef.current !== "screen") return;

          const input = event.inputBuffer.getChannelData(0);
          const copy = new Float32Array(input.length);
          copy.set(input);
          digitalLivePcmChunksRef.current.push(copy);
          digitalLivePcmSampleCountRef.current += copy.length;

          let peak = digitalLivePeakRef.current;
          for (let i = 0; i < input.length; i += 1) {
            const value = Math.abs(input[i]);
            if (value > peak) peak = value;
          }
          digitalLivePeakRef.current = peak;

          const now = Date.now();
          if (now - digitalLiveDebugLastUpdateRef.current > 1000) {
            digitalLiveDebugLastUpdateRef.current = now;
            const seconds = digitalLivePcmSampleCountRef.current / digitalLiveSampleRateRef.current;
            const signal = peak > 0.01 ? "senal detectada" : "sin senal audible";
            setDigitalAudioDebug(`${seconds.toFixed(1)}s PCM capturados · ${signal}`);
            digitalLivePeakRef.current = 0;
          }

          flushDigitalLiveTranscript(false);
        };
        source.connect(processor);
        processor.connect(audioContext.destination);
        digitalLiveProcessorRef.current = processor;
      }

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      drawWave();
    } catch (err) {
      console.error("Failed to configure canvas visualizer:", err);
    }
  };

  const drawWave = () => {
    if (!canvasRef.current || !analyserRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const analyser = analyserRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const width = canvas.width;
    const height = canvas.height;

    const render = () => {
      if (!isRecordingRef.current) return;
      animationFrameRef.current = requestAnimationFrame(render);

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Draw aesthetic soft background bars or a neon wavy line
      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = dataArray[i] / 1.5;

        // Apply custom color theme palette
        // Primary: #2C5EAD, Secondary: #1591DC, Accent: #4BB8FA
        const percent = i / bufferLength;
        const color = percent < 0.5 ? "#2C5EAD" : percent < 0.8 ? "#1591DC" : "#4BB8FA";
        
        ctx.fillStyle = color;
        // Vertically symmetric bars centered
        const yPos = (height - barHeight) / 2;
        ctx.fillRect(x, yPos, barWidth - 1, barHeight);

        x += barWidth;
      }
    };

    render();
  };

  // 2. Control Handlers for Live Voice Recording
  const startRecording = async () => {
    // Clean up any existing records, streams or timers to avoid leaks and duplicate sharing banners
    stopTracksAndTimers();

    setErrorMessage("");
    setLongSessionNotice("");
    setSpeechErrorNotice(null);
    setDuration(0);
    durationRef.current = 0;
    warningNotificationSentRef.current = false;
    maxDurationStopSentRef.current = false;
    sessionFinalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    setInterimTranscript("");
    setDraftWordCount(0);
    setFailedSessionData(null);
    audioChunksRef.current = [];
    setIsDigitalLiveTranscribing(false);

    // Initialize the live draft session
    const draftId = "draft_" + Date.now();
    currentDraftIdRef.current = draftId;
    if (onUpdateDraft) {
      onUpdateDraft({
        id: draftId,
        title: `Borrador en Vivo: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        transcript: "(Esperando voz...)",
        summary: "### Borrador Guardado en Tiempo Real\n\nEste es un borrador auto-guardado mientras hablabas. Si la transcripción del audio pesado falla, puedes usar la opción de IA para resumir este borrador de texto directamente en tu bóveda.",
        duration: "00:00",
        isDraft: true,
        date: new Date().toISOString()
      });
    }

    try {
      await requestDesktopNotificationPermission();

      let stream: MediaStream;
      if (captureSource === "screen") {
        try {
          let displayStream: MediaStream;
          try {
            // Keep the browser display-capture pipeline standard and alive. Forcing
            // a 1x1 video track can make Chrome/Edge show a black shared surface.
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true
            } as any);
          } catch (e) {
            console.warn("DisplayMedia with audio failed, trying video-only fallback...", e);
            try {
              displayStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false
              });
            } catch (err2) {
              console.error("Stable getDisplayMedia failed:", err2);
              throw err2;
            }
          }
          
          const audioTracks = displayStream.getAudioTracks();
          if (audioTracks.length === 0) {
            displayStream.getTracks().forEach((track) => track.stop());
            if (isFirefox) {
              throw new Error("Estás usando Firefox. Tu navegador no cuenta con soporte técnico para capturar sonido digital interno del sistema o de las pestañas en tu sistema operativo. Puedes cambiar a 'Mi Micrófono' (arriba) y subir el volumen de tus altavoces para grabarlo, o ingresar desde Google Chrome / Microsoft Edge.");
            } else if (isSafari) {
              throw new Error("Estás usando Safari. Safari restringe la captura digital de audio interno del sistema. Te recomendamos usar Google Chrome, o bien activar 'Mi Micrófono' con el sonido de los altavoces de tu Mac lo suficientemente alto.");
            } else {
              throw new Error("No has marcado la opción 'Compartir audio' o 'Compartir audio de la pestaña' al seleccionar. NOTA: Si estás usando una Mac (macOS), o si seleccionaste 'Toda la pantalla' o 'Ventana', el sistema oculta esta casilla. Para solucionarlo: Abre la reunión como pestaña de tu navegador, haz clic en Grabar, selecciona la pestaña 'Pestaña de Chrome' (arriba) y allí sí podrás marcar 'Compartir audio de la pestaña' (abajo a la izquierda).");
            }
          }
          
          // Escuchar cuando el usuario hace clic en el botón nativo de "Dejar de compartir" del navegador para finalizar grabación limpiamente
          displayStream.getTracks().forEach((track) => {
            track.onended = () => {
              if (stopRecordingRef.current) {
                stopRecordingRef.current();
              }
            };
          });

          streamRef.current = displayStream; // Guardamos el displayStream original para poder apagar tanto el video como el audio al finalizar
          stream = new MediaStream(audioTracks);
        } catch (err: any) {
          if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) {
            throw new Error("Permiso de captura cancelado o denegado por el usuario.");
          }
          throw err;
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
      }

      if (captureSource === "screen") {
        if (!isBrowserWhisperSupported()) {
          throw new Error("Este navegador no puede ejecutar Whisper local. Usa Microsoft Edge o Google Chrome actualizado para transcribir el audio de la pestaña.");
        }

        setSpeechErrorNotice("Preparando Whisper local. La primera vez puede tardar mientras se descarga el modelo en este navegador.");
        await warmupBrowserWhisper();
        digitalLiveEnabledRef.current = true;
        setDigitalLiveEnabled(true);
        setDigitalAudioDebug("Whisper listo. La transcripción local se guardará con marcas de tiempo.");
        setSpeechErrorNotice(null);
      }
      // Instantiate HTML MediaRecorder (optimized bitrate for voice recording)
      const options = { mimeType: "audio/webm", audioBitsPerSecond: 64000 };
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, options);
      } catch (e) {
        mediaRecorder = new MediaRecorder(stream); // fallback
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        try {
          // Do not release the PCM buffer until Whisper has consumed the final captured segment.
          await waitForDigitalLiveIdle();
          await flushDigitalLiveTranscript(true);
          await waitForDigitalLiveIdle();

          const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
          const finalTranscript = liveTranscriptRef.current.trim();
          const dur = durationRef.current || 0;

          if (captureSourceRef.current === "screen") {
            if (!finalTranscript) {
              setErrorMessage(
                "No se detectó voz transcribible en el audio compartido. No se guardó una transcripción vacía: confirma que compartiste el audio de la pestaña y vuelve a intentarlo."
              );
              return;
            }

            onTranscriptionSuccess({
              id: currentDraftIdRef.current || undefined,
              title: `Borrador en vivo - ${new Date().toLocaleDateString("es-CO")}`,
              transcript: finalTranscript,
              summary: "Transcripción local capturada con Whisper. Puedes analizarla con IA desde Explore cuando lo necesites.",
            }, dur);
          } else if (!finalTranscript) {
            console.log("Missing microphone transcript. Using server-side Gemini audio transcription as fallback.");
            await handleAudioProcess(audioBlob, dur);
          } else {
            console.log("Using live speech-to-text text-draft for summarizing.");
            await handleTextProcess(finalTranscript, dur);
          }
        } finally {
          mediaRecorderRef.current = null;
          stopTracksAndTimers();
          setIsProcessing(false);
          setProcessingStatus("");
        }
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(1000);

      isRecordingRef.current = true;
      isPausedRef.current = false;
      setIsRecording(true);
      setIsPaused(false);
      startVisualizer(stream);

      // Web Speech API for Real-time Live Transcription (only for microphone source)
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition && captureSource === "mic") {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "es-ES";

        recognition.onresult = (event: any) => {
          let currentSessionFinal = "";
          let currentInterim = "";

          for (let i = 0; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              currentSessionFinal += event.results[i][0].transcript + " ";
            } else {
              currentInterim += event.results[i][0].transcript;
            }
          }

          const fullText = (sessionFinalTranscriptRef.current + currentSessionFinal).trim() + " ";
          setLiveTranscript(fullText);
          liveTranscriptRef.current = fullText;
          setInterimTranscript(currentInterim);

          const wordCount = fullText.trim().split(/\s+/).filter(Boolean).length;
          setDraftWordCount(wordCount);
        };

        recognition.onerror = (e: any) => {
          console.warn("Speech recognition error:", e);
          if (e.error === "not-allowed") {
            setSpeechErrorNotice(
              "⚠️ Permiso de micrófono denegado para la transcripción en vivo por voz. " +
              "Asegúrate de conceder permisos al micrófono en la barra de direcciones. " +
              "Si tienes problemas debido al marco integrado (iframe) de AI Studio, haz clic en el botón 'Abrir en pestaña nueva' " +
              "(flecha diagonal arriba a la derecha, en la parte superior del navegador) para correr el sistema en pantalla completa sin restricciones."
            );
          } else if (e.error === "network") {
            setSpeechErrorNotice("⚠️ Error de conexión / red en el reconocimiento de voz en vivo.");
          } else if (e.error !== "no-speech" && e.error !== "aborted") {
            setSpeechErrorNotice(`⚠️ El reconocimiento de voz encontró una dificultad técnica (${e.error}).`);
          }
        };

        recognition.onend = () => {
          // Capture cumulative text from this session before restarting
          sessionFinalTranscriptRef.current = liveTranscriptRef.current;

          // Restart recognition if recording is still active to avoid timeout stops, using setTimeout for clean shutdown
          if (isRecordingRef.current && !isPausedRef.current) {
            setTimeout(() => {
              try {
                if (recognitionRef.current && isRecordingRef.current && !isPausedRef.current) {
                  recognition.start();
                }
              } catch (err) {
                console.warn("Speech recognition restart failed:", err);
              }
            }, 300);
          }
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch (e) {
          console.error("Speech recognition start failed:", e);
        }
      } else if (captureSource === "mic") {
        setSpeechErrorNotice(
          "⚠️ Tu navegador no tiene soporte nativo para el reconocimiento de voz en vivo (Web Speech API). Te recomendamos usar Google Chrome o Microsoft Edge."
        );
      }

      startRecordingTimer();

    } catch (err: any) {
      console.error("Acoustic setup failed:", err);
      const customMessage = err.message || "";
      if (customMessage.includes("No has marcado") || customMessage.includes("Compartir audio")) {
        setErrorMessage(customMessage);
      } else {
        setErrorMessage(
          "No se pudo acceder al micrófono o la captura de audio digital. Asegúrate de dar permisos de micrófono en este navegador. NOTA IMPORTANTE: Si estás usando la vista previa interactiva dentro de AI Studio, los navegadores bloquean la captura de pantalla/audio dentro de marcos integrados (iframes). Para que funcione perfectamente sin límites, haz clic en el botón 'Abrir en pestaña nueva' (el icono con una flecha que apunta hacia arriba a la derecha, arriba de esta pantalla) para abrir el sistema en una ventana completa."
        );
      }
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (isPaused) {
        mediaRecorderRef.current.resume();
        isPausedRef.current = false;
        setIsPaused(false);
        startRecordingTimer();
        // Resume SpeechRecognition
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      } else {
        mediaRecorderRef.current.pause();
        isPausedRef.current = true;
        setIsPaused(true);
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        // Pause SpeechRecognition
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }
      }
    }
  };

  const handleTextProcess = async (text: string, durationSec: number) => {
    setIsProcessing(true);
    setProcessingStatus("Analizando y compilando transcripción de clase...");
    
    const cleanText = text.trim();
    if (!cleanText || cleanText === "(Silencio por ahora)" || cleanText === "(Silencio grabado...)") {
      setErrorMessage("No se detectó suficiente texto o voz audible en esta sesión para elaborar un resumen inteligente.");
      setIsProcessing(false);
      setProcessingStatus("");
      return;
    }

    try {
      setProcessingStatus("Generando resumen ejecutivo y acta de clase con Gemini AI...");
      const response = await fetch("/api/summarize-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: cleanText,
        }),
      });

      const rawText = await response.text();

      if (!response.ok) {
        let errorMsg = "Fallo al procesar el resumen del texto.";
        try {
          const jsonError = JSON.parse(rawText);
          errorMsg = jsonError.error || errorMsg;
        } catch (e) {
          errorMsg = `Error en el servidor de transacciones (Estado ${response.status}).`;
        }
        throw new Error(errorMsg);
      }

      let json;
      try {
        json = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error("La respuesta del servidor no tiene un formato de datos JSON válido.");
      }

      onTranscriptionSuccess({
        ...json,
        id: currentDraftIdRef.current || undefined
      }, durationSec);

    } catch (err: any) {
      console.error("Text processing error details:", err);
      setErrorMessage(err.message || "No se pudo procesar la transcripción de clase.");
      setFailedSessionData({
        transcript: cleanText,
        durationSec,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      const finalTranscript = liveTranscriptRef.current || liveTranscript || "";

      // Stop SpeechRecognition immediately
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      isPausedRef.current = false;
      setIsRecording(false);
      setIsPaused(false);

      // Perform a robust final synchronized upload/save to the Cloud for the live PDF text draft
      if (onUpdateDraft && currentDraftIdRef.current && finalTranscript) {
        setIsSyncingDraft(true);
        const m = Math.floor(duration / 60);
        const s = duration % 60;
        const liveDurationFormatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        onUpdateDraft({
          id: currentDraftIdRef.current,
          title: `Borrador en Vivo: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          transcript: finalTranscript,
          summary: "### Borrador Guardado en Tiempo Real\n\nEste es un borrador auto-guardado mientras hablabas. Si la transcripción del audio pesado falla, puedes usar la opción de IA para resumir este borrador de texto directamente en tu bóveda.",
          duration: liveDurationFormatted,
          isDraft: true,
          date: new Date().toISOString()
        });
        setTimeout(() => {
          setIsSyncingDraft(false);
        }, 800);
      }

      // Set processing feedback immediately, handleTextProcess or handleAudioProcess will overwrite visual statuses momentarily
      setIsProcessing(true);
      setProcessingStatus("Deteniendo grabación y preparando recopilación de audio...");
    }
  };

  // 3. Audio Transcribing Proxy API Request Handler
  const handleAudioProcess = async (blob: Blob, durationSec: number) => {
    setIsProcessing(true);
    setProcessingStatus("Preparando canales de audio...");

    try {
      // 1. Read Blob as Base64 encoded string
      setProcessingStatus("Empaquetando datos de audio...");
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
      });
      const base64Data = await base64Promise;

      // Proactively check audio size in client to avoid Vercel Serverless maximum 4.5MB payload limitations before sending
      const payloadSizeBytes = base64Data.length;
      const isBypassed = !!settings.bypassSizeLimit;
      const limitMb = isBypassed ? 100 : 4.2;
      if (payloadSizeBytes > limitMb * 1024 * 1024) {
        if (isBypassed) {
          throw new Error(`El audio grabado superó incluso el límite máximo de 100 MB para entornos locales/VPS (${(payloadSizeBytes / (1024 * 1024)).toFixed(2)} MB). Intenta dividir tu grabación o sesión.`);
        } else {
          throw new Error(`El audio grabado es demasiado pesado (${(payloadSizeBytes / (1024 * 1024)).toFixed(2)} MB). Las funciones Serverless de Vercel limitan las transferencias de subida a un máximo de 4.5 MB. Te sugerimos realizar grabaciones más cortas o activar 'Desactivar límites de tamaño de audio' en Settings si corres localmente o en un VPS dedicado.`);
        }
      }

      // 2. Call local `/api/transcribe` backend endpoint (always server-side to adhere to security rules and prevent client browser CORS/shield blockages)
      let json;
      setProcessingStatus("Transcribiendo y analizando con Gemini AI...");
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Data,
          mimeType: blob.type || "audio/webm",
          liveDraftText: liveTranscript,
        }),
      });

      // Read response as text ONCE to avoid "body stream already read" and secure clean handling of server error text pages
      const rawText = await response.text();

      if (!response.ok) {
        let errorMsg = "Fallo en la transcripción de audio.";
        try {
          // If the server sent standard JSON error response, use it
          const jsonError = JSON.parse(rawText);
          errorMsg = jsonError.error || errorMsg;
        } catch (e) {
          // Fallback to analyze raw HTML / text or custom status errors from proxy layers like Vercel
          if (rawText.includes("Payload Too Large") || response.status === 413) {
            errorMsg = "El audio es demasiado pesado. Las funciones sin servidor de Vercel limitan las subidas a 4.5 MB. Por favor realiza grabaciones de menor duración.";
          } else if (response.status === 504 || response.status === 502 || rawText.toLowerCase().includes("timeout") || rawText.includes("FUNCTION_INVOCATION_FAILED")) {
            errorMsg = "La transcripción superó el límite de tiempo (timeout) de Vercel. En cuentas gratuitas (Hobby), Vercel limita la ejecución de funciones a 10 segundos. Para grabar sesiones más largas, te sugerimos correr la aplicación de forma local (con 'npm run dev') o en un servidor dedicado.";
          } else {
            errorMsg = `Error en el servidor de transacciones (Estado ${response.status}). Detalle: ${rawText.substring(0, 150)}...`;
          }
        }
        throw new Error(errorMsg);
      }

      // If OK, parse the raw text as JSON safely
      try {
        json = JSON.parse(rawText);
      } catch (parseError) {
        throw new Error(`El servidor respondió con código exitoso 200, pero la respuesta no es un JSON válido. Respuesta: ${rawText.substring(0, 120)}...`);
      }

      setProcessingStatus("Generando resumen ejecutivo y plan de acción...");
      onTranscriptionSuccess({
        ...json,
        id: currentDraftIdRef.current || undefined
      }, durationSec);

    } catch (err: any) {
      console.error("Transcription error details:", err);
      setErrorMessage(err.message || "No se pudo procesar el audio.");
      if (liveTranscript && liveTranscript.trim().length > 0) {
        setFailedSessionData({
          transcript: liveTranscript,
          durationSec,
        });
      }
    } finally {
      setIsProcessing(false);
      setProcessingStatus("");
    }
  };

  // 4. File Upload Drag-and-Drop and Input Handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      validateAndSetFile(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    const validExtensions = [".mp3", ".wav", ".m4a"];
    const fileExt = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    
    if (validExtensions.includes(fileExt) || file.type.startsWith("audio/")) {
      setSelectedFile(file);
      setErrorMessage("");
    } else {
      setErrorMessage("Tipo de archivo no soportado. Por favor sube formatos MP3, WAV o M4A.");
    }
  };

  const triggerUploadTranscribe = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setProcessingStatus("Leyendo archivo en memoria...");

    try {
      // Estimate audio duration based on average packet size or arbitrary default value
      const durationSec = Math.round(selectedFile.size / 32000) || 60; // fallback math
      await handleAudioProcess(selectedFile, durationSec);
      setSelectedFile(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Error al analizar el archivo manual.");
      setIsProcessing(false);
    }
  };

  const downloadLivePDF = () => {
    const textToPrint = cleanTextForExport(liveTranscriptRef.current || liveTranscript, {
      fallback: "(Sin palabras transcritas aun)",
      maxWords: 4500,
    });
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const footerY = pageHeight - 12;
    const contentBottom = pageHeight - 24;
    const maxLineWidth = pageWidth - margin * 2;

    let yPosition = 24;

    const drawPageBackground = () => {
      doc.setFillColor(19, 91, 241);
      doc.rect(0, 0, pageWidth, 3, "F");

      // Footer
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(145, 152, 166);
      doc.text("Olli | Transcripcion academica", margin, footerY);
      const pageNum = doc.getNumberOfPages();
      doc.text(`Pag. ${pageNum}`, pageWidth - margin - 15, footerY);
    };

    const checkPageOverflow = (neededHeight: number) => {
      if (yPosition + neededHeight > contentBottom) {
        doc.addPage();
        drawPageBackground();
        yPosition = 22;
      }
    };

    const writeMetaPill = (label: string, value: string, x: number, y: number) => {
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(7);
      doc.setTextColor(115, 128, 150);
      doc.text(label.toUpperCase(), x, y);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(42, 52, 70);
      doc.text(value, x, y + 5);
    };

    const writeHeading = (text: string) => {
      checkPageOverflow(10);
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(74, 92, 120);
      doc.text(text.toUpperCase(), margin, yPosition);
      yPosition += 7;
    };

    const writeSegment = (label: string, timestamp: string, text: string) => {
      const lines = doc.splitTextToSize(text, maxLineWidth - 18);
      const blockHeight = Math.max(16, lines.length * 4.6 + 9);
      checkPageOverflow(blockHeight);

      doc.setFillColor(19, 91, 241);
      doc.circle(margin + 4, yPosition + 2, 3, "F");
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(255, 255, 255);
      doc.text(String(label.replace("Segmento ", "")), margin + 3.2, yPosition + 3.5);

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(34, 45, 64);
      doc.text(label, margin + 12, yPosition + 1);
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(timestamp, margin + 36, yPosition + 1);

      doc.setFont("Helvetica", "normal");
      doc.setFontSize(9.4);
      doc.setTextColor(31, 41, 55);
      doc.text(lines, margin + 12, yPosition + 7);
      yPosition += blockHeight;
    };

    drawPageBackground();

    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(17, 17, 17);
    doc.text("Borrador transcrito en vivo", margin, yPosition);
    yPosition += 12;

    // Metadata
    const m = Math.floor(duration / 60);
    const s = duration % 60;
    const liveDurationFormatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    writeMetaPill("Fecha", new Date().toLocaleDateString(), margin, yPosition);
    writeMetaPill("Duracion", liveDurationFormatted, margin + 54, yPosition);
    writeMetaPill("Fuente", captureSource === "screen" ? "Audio digital" : "Microfono", margin + 98, yPosition);
    yPosition += 14;

    // Line separator
    doc.setDrawColor(235, 238, 244);
    doc.setLineWidth(0.4);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    writeHeading("Transcripcion");
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(100, 116, 139);
    const note = "Documento generado sin identificacion automatica de hablantes. Los bloques se organizan por tiempo para facilitar lectura y revision.";
    const noteLines = doc.splitTextToSize(note, maxLineWidth);
    doc.text(noteLines, margin, yPosition);
    yPosition += noteLines.length * 4.5 + 7;

    const segments = buildAcademicTranscriptSegments(textToPrint, duration, 120);
    segments.forEach((segment) => writeSegment(segment.label, segment.timestamp, segment.text));

    doc.save(`Olli_Borrador_Sincronizado_${Date.now()}.pdf`);
  };

  const formatTimer = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return [
      hrs > 0 ? String(hrs).padStart(2, "0") : null,
      String(mins).padStart(2, "0"),
      String(secs).padStart(2, "0"),
    ]
      .filter(Boolean)
      .join(":");
  };

  const cleanLiveTranscriptForDisplay = (text: string) => (
    text
      .replace(/\[(?:m[uú]sica|music|audio|sonido|silencio)\]/gi, "")
      .replace(/[♪♫]+/g, "")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trimStart()
  );

  const visibleLiveTranscript = cleanLiveTranscriptForDisplay(liveTranscript);
  const visibleInterimTranscript = cleanLiveTranscriptForDisplay(interimTranscript);
  const visibleWordCount = visibleLiveTranscript.trim()
    ? visibleLiveTranscript.trim().split(/\s+/).filter(Boolean).length
    : draftWordCount;
  const isLiveTranscriptionActive = isRecording && !isPaused && !isProcessing && (
    captureSource === "mic" || digitalLiveEnabled || isDigitalLiveTranscribing
  );

  const getFriendlyErrorMessage = (message: string) => {
    const raw = message || "";
    const lower = raw.toLowerCase();

    if (raw.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted")) {
      return "Gemini alcanzo el limite de cuota de tu API key. Espera a que se renueve la cuota o usa otra clave en Settings.";
    }

    if (raw.includes("401") || raw.includes("403") || lower.includes("api key") || lower.includes("permission")) {
      return "La API key de Gemini no es válida o no tiene permisos. Revisa la clave guardada en Settings.";
    }

    if (lower.includes("payload") || raw.includes("413")) {
      return "El audio es demasiado pesado para procesarlo de una sola vez. Intenta una grabación más corta.";
    }

    return raw.length > 220 ? `${raw.slice(0, 220)}...` : raw;
  };

  return (
    <div id="audio_recorder_box" className="bg-white border text-sans border-slate-100/80 rounded-2xl p-4 select-none relative overflow-hidden shadow-sm max-w-full">
      
      {/* Background Gradients */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-[#C4E2F5] blur-[80px] opacity-30 pointer-events-none"></div>
      <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-[#4BB8FA] blur-[80px] opacity-15 pointer-events-none"></div>

      {/* Local Unlimited Recording Mode Alert Banner */}
      {settings.bypassSizeLimit && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-start space-x-3 text-emerald-800 text-xs relative z-10 shadow-xs">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0 mt-1"></div>
          <div className="flex-1 text-left leading-relaxed">
            <span className="font-bold">⚠️ Modo Local Activo (Sin Límites de Peso)</span>
            <p className="mt-0.5 text-emerald-700">
              Estás grabando en modo sin límites. No se aplicará la restricción típica de 4.5 MB de la nube, permitiendo procesar sesiones largas de hasta 100 MB.
            </p>
          </div>
        </div>
      )}

      {/* Tab Selectors */}
      <div className="flex border-b border-slate-100/80 mb-8 relative z-10">
        <button
          onClick={() => {
            if (!isRecording && !isProcessing) {
              setActiveMode("record");
              setErrorMessage("");
            }
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeMode === "record"
              ? "border-[#2C5EAD] text-[#2C5EAD]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          } ${isRecording || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Grabar en Vivo
        </button>
        <button
          onClick={() => {
            if (!isRecording && !isProcessing) {
              setActiveMode("upload");
              setErrorMessage("");
            }
          }}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 cursor-pointer ${
            activeMode === "upload"
              ? "border-[#2C5EAD] text-[#2C5EAD]"
              : "border-transparent text-slate-400 hover:text-slate-600"
          } ${isRecording || isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          Subir Audio
        </button>
      </div>

      {/* Error state */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-medium text-rose-600 flex items-start space-x-3 text-left break-words"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div>
                <span className="font-bold">Acoustic Guard: </span>
                {getFriendlyErrorMessage(errorMessage)}
              </div>
              
              {errorMessage.includes("Firefox") || errorMessage.includes("Safari") || errorMessage.includes("Compartir audio") ? (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCaptureSource("mic");
                      setErrorMessage("");
                    }}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Usar Mi Micrófono en su lugar</span>
                  </button>
                </div>
              ) : null}

              {failedSessionData && (
                <div className="mt-4 p-4 bg-indigo-50/70 border border-indigo-100/80 rounded-xl text-left">
                  <p className="text-xs text-indigo-950 font-bold mb-1 flex items-center space-x-1.5">
                    <span className="text-sm">💡</span>
                    <span>¡No has perdido tu transcripción!</span>
                  </p>
                  <p className="text-[11px] text-indigo-700 leading-relaxed mb-3">
                    Aunque el análisis en la nube falló, el sistema transcribió con éxito <strong>{failedSessionData.transcript.split(/\s+/).filter(Boolean).length} palabras</strong> en vivo. Presiona el botón de abajo para guardarla como respaldo en tu historial.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onTranscriptionSuccess({
                        id: currentDraftIdRef.current || undefined,
                        title: `Respaldo: Conversación ${new Date().toLocaleDateString()}`,
                        transcript: failedSessionData.transcript,
                        summary: `### Transcripción en Vivo de Respaldo\n\nEsta nota se recuperó de forma segura de tu sesión en tiempo real. ¡Puedes resumirla con Inteligencia Artificial haciendo clic en 'Resumir Borrador con IA'!\n\n${failedSessionData.transcript}`
                      }, failedSessionData.durationSec);
                      setFailedSessionData(null);
                      setErrorMessage("");
                    }}
                    className="inline-flex items-center space-x-2 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/10 cursor-pointer"
                  >
                    <span>Guardar Transcripción de Respaldo</span>
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {longSessionNotice && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="mb-6 p-4 bg-amber-50 border border-amber-100 rounded-xl text-xs font-semibold text-amber-900 flex items-start space-x-3 text-left"
          >
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">
              <span className="font-black">Aviso de clase larga: </span>
              {longSessionNotice}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mode Renderers */}
      {activeMode === "record" ? (
        <div className="w-full py-2">
          
          <AnimatePresence mode="wait">
            {!isRecording ? (
              <motion.div
                key="start-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="w-full text-left"
              >
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch w-full max-w-2xl mx-auto mb-2">
                  
                  {/* LEFT COLUMN: TRIGGER AND MODE OPTIONS */}
                  <div className="lg:col-span-12 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 text-left relative shadow-sm">
                    <div className="flex items-start justify-between gap-4 mb-5">
                      <div>
                        <p className="text-[10px] font-black text-[#135bf1] uppercase tracking-widest">
                          Preparar captura
                        </p>
                        <h3 className="text-lg font-black text-slate-950 tracking-tight mt-1">
                          {captureSource === "screen" ? "Audio digital de pestaña" : "Micrófono del equipo"}
                        </h3>
                        <p className="text-xs text-slate-500 leading-relaxed mt-1 max-w-md">
                          {captureSource === "screen"
                            ? "Captura el sonido de una pestaña o pantalla. Whisper local puede mostrar texto en vivo sin usar Gemini."
                            : "Usa el micrófono para grabar voz ambiente cuando no puedas compartir audio digital."}
                        </p>
                      </div>
                      <div className="w-11 h-11 rounded-2xl bg-[#135bf1]/8 border border-[#135bf1]/15 flex items-center justify-center shrink-0">
                        {captureSource === "screen" ? (
                          <Tv className="w-5 h-5 text-[#135bf1]" />
                        ) : (
                          <Mic className="w-5 h-5 text-[#135bf1]" />
                        )}
                      </div>
                    </div>

                    {/* Audio Capture Source Selector */}
                    <div className="grid grid-cols-2 bg-slate-100 p-1 rounded-xl mb-4 gap-1 w-full">
                      <button
                        type="button"
                        onClick={() => setCaptureSource("mic")}
                        className={`min-h-11 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          captureSource === "mic"
                            ? "bg-white text-[#2C5EAD] shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Mic className="w-3.5 h-3.5" />
                        <span>Micrófono</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCaptureSource("screen")}
                        className={`min-h-11 py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                          captureSource === "screen"
                            ? "bg-white text-[#2C5EAD] shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <Tv className="w-3.5 h-3.5" />
                        <span>Audio digital</span>
                      </button>
                    </div>

                    {captureSource === "screen" && (
                      <div className="hidden">
                        
                        {isFirefox && (
                          <div className="mb-3.5 p-3 bg-red-50 border border-red-200/60 rounded-lg text-[10.5px] text-red-900 leading-normal">
                            <div className="font-bold flex items-center space-x-1 mb-1 text-red-950">
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>Firefox No Permite Audio Digital</span>
                            </div>
                            Estás usando <strong>Firefox</strong>. Por limitaciones de Mozilla, no se permite capturar audio interno de pestañas. Te sugerimos:
                            <ul className="list-disc pl-3.5 mt-1 space-y-0.5 font-medium">
                              <li>Usa <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong> para capturar digitalmente.</li>
                              <li>O haz clic para <span className="underline text-indigo-700 font-bold hover:text-indigo-900 cursor-pointer" onClick={() => setCaptureSource("mic")}>Usar Mi Micrófono</span>.</li>
                            </ul>
                          </div>
                        )}

                        {isSafari && (
                          <div className="mb-3.5 p-3 bg-red-50 border border-red-200/60 rounded-lg text-[10.5px] text-red-900 leading-normal">
                            <div className="font-bold flex items-center space-x-1 mb-1 text-red-950">
                              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                              <span>Safari No Permite Audio Digital</span>
                            </div>
                            Estás usando <strong>Safari</strong>. Por restricciones de Apple, no se permite capturar audio digital interno. Te sugerimos:
                            <ul className="list-disc pl-3.5 mt-1 space-y-0.5 font-medium">
                              <li>Usa <strong>Google Chrome</strong> o <strong>Microsoft Edge</strong> para capturar digitalmente.</li>
                              <li>O haz clic para <span className="underline text-indigo-700 font-bold hover:text-indigo-900 cursor-pointer" onClick={() => setCaptureSource("mic")}>Usar Mi Micrófono</span>.</li>
                            </ul>
                          </div>
                        )}

                        <div className="font-bold flex items-center space-x-1.5 mb-2 text-sky-800">
                          <Volume2 className="w-4 h-4 text-sky-600 shrink-0" />
                          <span>Guía para capturar Audio Digital (Reuniones)</span>
                        </div>
                        <p className="mb-2">
                          Para capturar el sonido del navegador sin ruidos de fondo, sigue estos pasos:
                        </p>
                        <ol className="list-decimal pl-4 space-y-1 mb-2">
                          <li>Abre la reunión (Zoom web, Meet o Teams) en una <strong>Pestaña del Navegador</strong>.</li>
                          <li>Presiona el botón de grabación abajo.</li>
                          <li>En la ventana emergente, selecciona la pestaña superior llamada <strong className="text-indigo-700">"Pestaña de Chrome"</strong> (o "Pestaña de Edge/Brave").</li>
                          <li>Selecciona la pestaña de tu reunión y <strong className="underline text-rose-600">marca la casilla "Compartir audio de la pestaña"</strong> en la esquina inferior izquierda.</li>
                          <li>Haz clic en <strong>Compartir</strong>.</li>
                        </ol>
                        <div className="mt-2.5 pt-2 border-t border-sky-200/50 text-[10.5px] text-amber-700 bg-amber-50/50 -mx-4 -mb-4 p-3 rounded-b-xl">
                          <span className="font-bold">⚠️ ¿No te aparece la opción de compartir audio?</span>
                          <ul className="list-disc pl-4 mt-1 space-y-1">
                            <li><strong>Si estás en Mac (macOS):</strong> Apple bloquea la grabación de audio de toda la pantalla o de ventanas de programas de escritorio. <strong>La opción de audio solo aparecerá si compartes una "Pestaña de Chrome/Navegador"</strong>.</li>
                            <li><strong>Reuniones en Apps de escritorio (Zoom/Teams instalados):</strong> El navegador no puede capturar su sonido interno directamente. Te recomendamos abrir estas reuniones usando su versión web en el navegador.</li>
                          </ul>
                        </div>
                      </div>
                    )}
                    
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 mb-5">
                      {captureSource === "screen" ? (
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-xs font-black text-slate-900">Transcripción local en vivo</p>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                              Activa Whisper si necesitas ver palabras durante la clase.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={toggleDigitalLiveTranscription}
                            className={`w-12 h-6 rounded-full p-0.5 transition-colors shrink-0 ${digitalLiveEnabled ? "bg-[#135bf1]" : "bg-slate-200"}`}
                            title="Activar Whisper en vivo dentro de la web"
                          >
                            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${digitalLiveEnabled ? "translate-x-6" : "translate-x-0"}`} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start gap-3">
                          <Volume2 className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-black text-slate-900">Grabación por micrófono</p>
                            <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                              Ideal para clases presenciales o cuando el navegador no permite capturar audio digital.
                            </p>
                          </div>
                        </div>
                      )}
                      <div className="mt-3 text-[10px] font-bold text-slate-500">
                        {captureSource === "screen"
                          ? (digitalLiveEnabled ? "Whisper ON: verás texto después de unos segundos." : "Whisper OFF: solo se guardará el audio capturado.")
                          : "La calidad depende del volumen del ambiente y la distancia al micrófono."}
                      </div>
                    </div>
                    
                    {/* Visual recording trigger button */}
                    <button
                      onClick={startRecording}
                      disabled={isProcessing}
                      className="w-full min-h-14 rounded-2xl bg-[#135bf1] hover:bg-[#0746cc] text-white flex items-center justify-between gap-4 px-5 transition-all cursor-pointer shadow-md shadow-[#135bf1]/20 active:scale-[0.99] group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                          {captureSource === "screen" ? <Tv className="w-4.5 h-4.5" /> : <Mic className="w-4.5 h-4.5" />}
                        </span>
                        <div className="text-left min-w-0">
                          <p className="text-sm font-black leading-tight">
                            {captureSource === "screen" ? "Iniciar captura digital" : "Iniciar grabación"}
                          </p>
                          <p className="text-[10px] font-semibold text-white/75 leading-tight mt-0.5">
                            {captureSource === "screen" ? "Selecciona la pestaña y comparte audio" : "Usar micrófono del equipo"}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>

                  {/* RIGHT COLUMN: QUICK BENCHMARKS & BEST PRACTICES */}
                  <div className="hidden">
                    <div>
                      <div className="text-[#2C5EAD] text-[10px] tracking-wider font-extrabold uppercase mb-2 flex items-center space-x-1">
                        <Sparkles className="w-3.5 h-3.5 text-[#1591DC]" />
                        <span>Tecnología olli.</span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-800 mb-4">Optimizado para clases y conferencias</h4>
                      
                      <div className="space-y-4">
                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-indigo-50 rounded-xl text-indigo-650 shrink-0 text-sm">🔒</div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-800">Almacenamiento Privado Cifrado</h5>
                            <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">Tus grabaciones y resúmenes se guardan en el navegador de manera segura. Nadie más tiene acceso a tus clases.</p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-amber-50 rounded-xl text-amber-650 shrink-0 text-sm">⚡</div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-800">Copiloto Inteligente de Estudio</h5>
                            <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">La inteligencia artificial reconoce automáticamente las preguntas del docente y te ayuda a resolver dudas en vivo.</p>
                          </div>
                        </div>

                        <div className="flex items-start space-x-3">
                          <div className="p-2 bg-emerald-50 rounded-xl text-emerald-650 shrink-0 text-sm">🎧</div>
                          <div>
                            <h5 className="text-xs font-bold text-slate-800">Acoustic Guard Activo</h5>
                            <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">El sistema mejora la lectura del audio y mantiene la transcripción ordenada durante la clase.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100/80 flex items-center justify-between text-[9px] text-slate-450 font-bold uppercase tracking-wider">
                      <span>Vault Status: Protegido</span>
                      <span className="text-[#2C5EAD]">Offline-First</span>
                    </div>
                  </div>

                </div>
              </motion.div>
            ) : (
              <motion.div
                key="recording-screen"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full"
              >
                {/* Dual Pane Grid Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-stretch w-full max-w-full overflow-hidden">
                  
                  {/* LEFT COLUMN: LIVE TRANSCRIPTION */}
                  <div className="min-w-0 flex flex-col items-stretch bg-slate-50/30 border border-slate-100 rounded-2xl p-4 relative">
                    
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between w-full px-4 py-2 bg-white/80 backdrop-blur-md border border-slate-100 rounded-2xl mb-4 gap-2 shadow-3xs">
                      <div className="flex items-center space-x-2">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-700 uppercase tracking-wider">
                          {isPaused ? "Captura Pausada" : "Captura Activa"}
                        </span>
                      </div>

                      {/* Miniature Visualizer */}
                      <div className="w-20 h-5 bg-slate-100/50 rounded-md relative overflow-hidden flex items-center justify-center shrink-0">
                        <canvas
                          ref={canvasRef}
                          width={100}
                          height={20}
                          className="w-full h-full block"
                        />
                        {isPaused && (
                          <div className="absolute inset-0 bg-white/70 flex items-center justify-center text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                            Pausada
                          </div>
                        )}
                      </div>

                      {/* Timer Clock */}
                      <div className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2C5EAD] tracking-wider font-mono bg-slate-50 px-2.5 py-0.5 rounded-lg border border-slate-100/65">
                        <Clock className="w-3.5 h-3.5 text-[#2C5EAD]" />
                        <span>{formatTimer(duration)}</span>
                      </div>
                    </div>

                    {/* LIVE CHAT-STYLE TRANSCRIPTION CONTAINER */}
                    <div className="flex-1 bg-white border border-slate-200/70 rounded-2xl p-4 flex flex-col items-stretch text-left shadow-2xs">
                      {/* Box Header */}
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/55">
                        <div className={`flex items-center space-x-1.5 text-[10px] font-bold uppercase tracking-widest ${
                          isLiveTranscriptionActive ? "text-[#135bf1]" : "text-rose-500"
                        }`}>
                          <span className={`relative inline-flex h-2 w-2 rounded-full ${
                            isLiveTranscriptionActive ? "bg-[#135bf1]" : "bg-rose-500 animate-pulse"
                          }`}>
                            {isLiveTranscriptionActive && (
                              <span className="absolute inline-flex h-full w-full rounded-full bg-[#135bf1] opacity-70 animate-ping" />
                            )}
                          </span>
                          <span>Transcripcion de clase en vivo</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {captureSource === "screen" && (
                            <div className="flex items-center gap-2">
                              {digitalAudioDebug && (
                                <span className="hidden sm:inline text-[9px] font-bold text-slate-400">
                                  {digitalAudioDebug}
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={toggleDigitalLiveTranscription}
                                className={`px-2.5 py-1 rounded-lg border text-[9px] font-extrabold uppercase tracking-wider transition-colors ${
                                  digitalLiveEnabled
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                                    : "bg-slate-50 border-slate-200 text-slate-500"
                                }`}
                                title="Activar o pausar Whisper en vivo dentro de la web"
                              >
                                Whisper {digitalLiveEnabled ? "ON" : "OFF"}
                              </button>
                            </div>
                          )}
                          <span className="text-[10px] bg-[#135bf1]/5 border border-[#135bf1]/10 px-2 py-0.5 rounded-md font-bold text-[#135bf1]">
                            {visibleWordCount} palabras
                          </span>
                        </div>
                      </div>
                      
                      {/* Live Feed Dialog Scroll Window */}
                      <div 
                        ref={liveScrollRef}
                        className="w-full min-w-0 overflow-y-auto overflow-x-hidden font-sans scroll-smooth pr-1 flex flex-col justify-start" 
                        style={{ height: "clamp(360px, 52vh, 560px)", maxHeight: "560px", minHeight: "360px" }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="relative w-9 h-9 rounded-xl bg-[#135bf1]/8 border border-[#135bf1]/15 flex items-center justify-center shrink-0 select-none">
                            {isLiveTranscriptionActive && (
                              <>
                                <span className="absolute inset-0 rounded-xl bg-[#135bf1]/20 animate-ping" />
                                <span className="absolute -inset-1 rounded-2xl border border-[#135bf1]/20 animate-pulse" />
                              </>
                            )}
                            {captureSource === "screen" ? (
                              <Volume2 className="relative z-10 w-4.5 h-4.5 text-[#135bf1]" />
                            ) : (
                              <Mic className="relative z-10 w-4.5 h-4.5 text-[#135bf1]" />
                            )}
                          </div>
                          
                          <div className="flex-grow min-w-0 bg-white border border-[#E9E9EB] p-4 rounded-xl shadow-3xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                              <p className="text-[9.5px] font-extrabold text-[#135bf1] uppercase tracking-widest leading-none">
                                Canal de audio directo
                              </p>
                              <span className="text-[9px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-1 rounded-lg">
                                {captureSource === "screen" ? "Audio digital" : "Microfono"}
                              </span>
                            </div>
                            
                            <div className="text-[15px] text-slate-800 font-normal leading-7 font-sans whitespace-pre-wrap select-text animate-fade-in">
                              {speechErrorNotice && (
                                <div className="mb-4 p-3 bg-rose-50 border border-rose-100/90 rounded-xl text-[11px] font-semibold text-rose-600 flex items-start space-x-2">
                                  <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                                  <span className="flex-1">{speechErrorNotice}</span>
                                </div>
                              )}
                              {captureSource === "screen" && visibleLiveTranscript ? (
                                <div className="space-y-2 bg-transparent pr-1">
                                  <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-emerald-50 border border-emerald-100 rounded-lg text-[9.5px] font-bold text-emerald-700 uppercase tracking-wider mb-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>Transcripcion local en vivo</span>
                                  </div>
                                  <div className="text-slate-800 font-normal whitespace-pre-wrap text-justify [text-wrap:pretty]">{visibleLiveTranscript}</div>
                                </div>
                              ) : captureSource === "screen" ? (
                                <div className="text-slate-500 text-left py-12 flex flex-col items-center justify-center space-y-3 mt-4 px-4">
                                  <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center shadow-3xs">
                                    <Volume2 className="w-6 h-6 text-[#135bf1]" />
                                  </div>
                                  <span className="text-xs font-bold text-[#2C5EAD] uppercase tracking-wider">
                                    {isDigitalLiveTranscribing ? "Transcribiendo segmento..." : "Capturando audio digital"}
                                  </span>
                                  <span className="text-[11px] font-medium text-slate-400 text-center leading-relaxed">
                                    {digitalLiveEnabled
                                      ? "Whisper procesa segmentos dentro del navegador. Cada bloque guardado incluye su marca de tiempo."
                                      : "Preparando la transcripción local. Comparte el audio de la pestaña para detectar voz."}
                                  </span>
                                </div>
                              ) : visibleLiveTranscript || visibleInterimTranscript ? (
                                <div className="space-y-1 bg-transparent pr-1">
                                  <span className="text-slate-800 font-normal text-justify [text-wrap:pretty]">{visibleLiveTranscript}</span>
                                  {visibleInterimTranscript && (
                                    <span className="text-slate-400 italic font-medium"> {visibleInterimTranscript}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="text-slate-400 italic text-left py-12 flex flex-col items-center justify-center space-y-2 mt-4">
                                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center">
                                    <Mic className="w-5 h-5 text-slate-400" />
                                  </div>
                                  <span className="text-[11px] font-medium text-slate-400">
                                    Habla para ver la transcripción en vivo aquí...
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Tool bar with Save state and download PDF */}
                      <div className="w-full mt-3 pt-3 border-t border-slate-200/40 flex items-center justify-between text-[10px] text-slate-500 font-medium">
                        <div className="flex items-center space-x-1.5 text-emerald-600 font-semibold">
                          <Check className="w-3 h-3 stroke-[3px]" />
                          <span>
                            {isSyncingDraft 
                              ? "Autoguardado..." 
                              : `Sincronizado con la boveda`
                            }
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={downloadLivePDF}
                          disabled={!liveTranscript && !interimTranscript}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#2C5EAD] hover:bg-[#1591DC] text-white rounded-lg text-[9.5px] font-bold transition-all shadow-3xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
                        >
                          <FileDown className="w-3 h-3" />
                          <span>Descargar PDF</span>
                        </button>
                      </div>
                    </div>

                    {/* Bottom controls */}
                    <div className="flex items-center justify-center space-x-3 w-full border-t border-slate-100 pt-4 mt-4">
                      <button
                        onClick={pauseRecording}
                        className="p-2 bg-white hover:bg-slate-50 rounded-full border border-slate-200 text-slate-600 hover:text-slate-800 transition-all cursor-pointer shadow-3xs active:scale-95"
                        title={isPaused ? "Reanudar sesion" : "Pausar sesion"}
                      >
                        {isPaused ? <Play className="w-4 h-4 text-emerald-500 fill-emerald-500" /> : <Pause className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={stopRecording}
                        className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center space-x-2 font-bold text-[10.5px] uppercase tracking-wider transition-all cursor-pointer shadow-sm active:scale-95"
                      >
                        <Square className="w-3.5 h-3.5 fill-white" />
                        <span>{captureSource === "screen" ? "Terminar y guardar" : "Terminar y procesar"}</span>
                      </button>
                    </div>

                  </div>

                  {/* RIGHT COLUMN: PROFESSOR QUESTION COPILOT */}
                  <div className="min-w-0 flex flex-col items-stretch bg-white border border-slate-200/70 rounded-2xl p-4 relative min-h-[420px]">
                    {!isCopilotActive ? (
                      <>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-3.5">
                          <div className="flex items-center space-x-2">
                            <GraduationCap className="w-4 h-4 text-slate-450" />
                            <div>
                              <span className="text-xs font-bold text-slate-500 block leading-tight">Copiloto de Preguntas</span>
                              <span className="text-[9px] text-slate-400 font-bold tracking-wide uppercase">OFF</span>
                            </div>
                          </div>
                          <span className="text-[9.5px] bg-emerald-50 border border-emerald-150 px-2 py-0.5 rounded-md font-bold text-emerald-650">
                            Inactivo
                          </span>
                        </div>

                        {/* Ahorro Body */}
                        <div className="flex flex-col items-center justify-center text-center p-4 my-auto max-h-[360px]">
                          <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100/60 flex items-center justify-center text-indigo-550 mb-5 shadow-xs relative overflow-hidden ">
                            <Cpu className="w-6 h-6 text-[#135bf1] relative z-10" />
                            <div className="absolute inset-0 bg-gradient-to-tr from-[#135bf1]/10 to-transparent pointer-events-none" />
                          </div>
                          <h4 className="text-sm font-bold text-slate-800 tracking-tight">Copiloto en OFF</h4>
                          <p className="text-xs text-slate-500 leading-relaxed mt-2.5 max-w-xs">
                            Activalo solo cuando el profesor haga preguntas y necesites una respuesta rapida.
                          </p>
                          <p className="text-[11px] text-slate-400 mt-1.5 max-w-xs">
                            Si no hay transcripcion real, escribe manualmente la pregunta que te hicieron.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsCopilotActive(true)}
                            className="mt-6 px-5 py-2.5 bg-[#135bf1] hover:bg-[#0746cc] text-white rounded-xl font-bold text-[10.5px] uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer flex items-center gap-2"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-yellow-305 animate-pulse" />
                            <span>Activar ON</span>
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        {/* Header */}
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 mb-3.5">
                          <div className="flex items-center space-x-2">
                            <GraduationCap className="w-4 h-4 text-[#135bf1]" />
                            <div>
                              <span className="text-xs font-bold text-[#111111] block leading-tight">Copiloto de Preguntas</span>
                              <span className="text-[9px] text-[#135bf1] font-bold tracking-wide uppercase">ON</span>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setIsCopilotActive(false)}
                              className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[9px] font-bold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                            >
                              OFF
                            </button>
                            <button
                              type="button"
                              onClick={scanClassroomQuestionsWithAI}
                              disabled={isDetectingQuestions || (!liveTranscript && !interimTranscript)}
                              className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg border font-bold text-[9px] transition-all cursor-pointer ${
                                isDetectingQuestions
                                  ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                                  : "bg-white border-slate-200 text-slate-700 hover:border-[#135bf1] hover:text-[#135bf1] shadow-3xs"
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              {isDetectingQuestions ? (
                                <>
                                  <Loader2 className="w-2.5 h-2.5 animate-spin text-indigo-600" />
                                  <span>Escaneando...</span>
                                </>
                              ) : (
                                <>
                                  <Search className="w-2.5 h-2.5 text-[#135bf1]" />
                                  <span>Detectar</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* DYNAMIC DETECTED QUESTIONS CHIPS */}
                        <div className="mb-4 bg-white/70 border border-slate-200/45 p-3 rounded-xl">
                          <p className="text-[9px] font-bold text-slate-550 uppercase tracking-widest mb-2 flex items-center space-x-1">
                            <Sparkles className="w-2.5 h-2.5 text-[#135bf1] animate-pulse" />
                            <span>Preguntas del profesor</span>
                          </p>
                          
                          {detectedQuestions.length === 0 ? (
                            <p className="text-[10px] text-slate-400 italic">
                              Aun no hay texto suficiente para consultar. Puedes escribir manualmente la pregunta que te hizo el profesor.
                            </p>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 max-h-[85px] overflow-y-auto pr-1">
                              {detectedQuestions.map((q, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    const cleanQ = q.replace(/^Pregunta\/Dato:\s*"/, "").replace(/"$/, "");
                                    handleSendLiveChat(`Responde de forma breve y clara esta pregunta del profesor: "${cleanQ}"`);
                                  }}
                                  className="inline-flex items-center space-x-1 px-2 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100/50 hover:border-indigo-200/80 rounded-lg text-[9.5px] font-medium text-indigo-700 text-left transition-all cursor-pointer active:scale-95"
                                >
                                  <HelpCircle className="w-2.5 h-2.5 shrink-0 text-indigo-500" />
                                  <span className="truncate max-w-[240px]">{q}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* CHAT MESSAGES PANEL */}
                        <div 
                          ref={chatScrollRef}
                          className="flex-1 overflow-y-auto space-y-3 pr-1 py-1 mb-4 border-b border-slate-200/50 flex flex-col justify-start"
                          style={{ height: "300px", maxHeight: "300px" }}
                        >
                          {chatMessages.map((msg, i) => (
                            <div
                              key={i}
                              className={`flex items-start gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
                            >
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 select-none ${
                                msg.role === "user" ? "bg-slate-200 text-slate-700" : "bg-indigo-600/10 border border-indigo-100 text-indigo-700"
                              }`}>
                                {msg.role === "user" ? "👤" : "🤖"}
                              </div>
                              
                              <div className={`p-3 rounded-2xl max-w-[85%] text-xs shadow-3xs transition-shadow ${
                                msg.role === "user" 
                                  ? "bg-indigo-600 text-white rounded-tr-none text-right font-medium" 
                                  : "bg-white border border-slate-200/70 text-slate-800 rounded-tl-none text-left"
                              }`}>
                                <div className="whitespace-pre-wrap font-sans text-[11.5px] leading-relaxed">
                                  {msg.content}
                                </div>
                                
                                {msg.timestamp && (
                                  <span className={`block text-[8px] mt-1 select-none font-medium ${msg.role === "user" ? "text-indigo-200" : "text-slate-400"}`}>
                                    {msg.timestamp}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}

                          {isChatSending && (
                            <div className="flex items-start gap-2.5">
                              <div className="w-6 h-6 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center font-bold text-[10px] shrink-0 select-none">
                                🤖
                              </div>
                              <div className="bg-white border border-slate-200/70 p-3 rounded-2xl rounded-tl-none shadow-3xs">
                                <div className="flex items-center space-x-1.5">
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                                  <span className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                                  <span className="text-[10px] text-slate-400 font-bold ml-1">Preparando respuesta...</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* FLOATING SUGGESTIONS CHIPS */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-2 py-1">
                          <button
                            type="button"
                            onClick={() => {
                              const question = detectedQuestions[0];
                              handleSendLiveChat(question ? `Responde de forma breve y clara esta pregunta del profesor: "${question}"` : "Aun no hay una pregunta detectada. Cuando el profesor pregunte algo, escribela aqui para responderla.");
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[9.5px] text-slate-600 transition-all font-semibold shrink-0 cursor-pointer active:scale-95"
                          >
                            Responder
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendLiveChat("Explicame brevemente la pregunta o concepto que acaba de mencionar el profesor, sin hacer resumen de toda la clase.")}
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[9.5px] text-slate-600 transition-all font-semibold shrink-0 cursor-pointer active:scale-95"
                          >
                            Explicar breve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendLiveChat("Dame un ejemplo corto para responder mejor esta pregunta del profesor.")}
                            className="px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg text-[9.5px] text-slate-600 transition-all font-semibold shrink-0 cursor-pointer active:scale-95"
                          >
                            Dar ejemplo
                          </button>
                        </div>

                        {/* CHAT INPUT AREA */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleSendLiveChat(chatInput);
                          }}
                          className="flex items-stretch gap-2"
                        >
                          <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Escribe la pregunta que te hizo el profesor..."
                            disabled={isChatSending}
                            className="flex-grow bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#135bf1] transition-all disabled:opacity-50"
                          />
                          <button
                            type="submit"
                            disabled={isChatSending || !chatInput.trim()}
                            className="px-3 py-2 bg-[#135bf1] hover:bg-[#0746cc] text-white rounded-xl flex items-center justify-center transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </>
                    )}

                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      ) : (
        <div className="py-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch w-full mb-2">
            
            {/* LEFT COLUMN: FILE DROP ZONE */}
            <div className="lg:col-span-7 flex flex-col justify-center">
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed border-slate-200 hover:border-[#1591DC] hover:bg-slate-50/50 rounded-3xl py-14 px-6 text-center cursor-pointer transition-all ${
                  dragActive ? "border-[#2C5EAD] bg-[#2C5EAD]/5" : ""
                }`}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".mp3,.wav,.m4a,audio/*"
                  className="hidden"
                />
                
                <div className="w-12 h-12 rounded-full bg-[#1591DC]/5 flex items-center justify-center text-[#1591DC] mx-auto mb-4">
                  <UploadCloud className="w-6 h-6" />
                </div>

                <h3 className="text-sm font-bold text-slate-800">
                  Arrastra y suelta tus archivos de audio aquí
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Soporta formatos MP3, WAV o M4A (Máx 100MB)
                </p>
                
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-650 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Buscar Archivos
                </button>
              </div>

              {selectedFile && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-6 p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between shadow-3xs"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-[#2C5EAD]/10 text-[#2C5EAD] flex items-center justify-center shrink-0">
                      <FileAudio className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-700 block truncate">
                        {selectedFile.name}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={triggerUploadTranscribe}
                    className="px-4 py-2 bg-[#2C5EAD] hover:bg-[#1591DC] text-white rounded-xl text-xs font-semibold shadow-sm transition-all cursor-pointer"
                  >
                    Transcribir Archivo
                  </button>
                </motion.div>
              )}
            </div>

            {/* RIGHT COLUMN: OFFLINE ADVICE & UPLOAD SPECS */}
            <div className="lg:col-span-5 flex flex-col justify-between bg-gradient-to-br from-slate-50/50 to-white border border-slate-100/90 rounded-3xl p-6 sm:p-8 text-left relative shadow-3xs">
              <div>
                <div className="text-[#1591DC] text-[10px] tracking-wider font-extrabold uppercase mb-2 flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5 text-[#2C5EAD]" />
                  <span>Subir Archivos Offline</span>
                </div>
                <h4 className="text-sm font-bold text-slate-800 mb-4">¿Grabaste tu clase de forma presencial?</h4>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  Sube audios capturados con tu celular, grabadora de voz o descargados de plataformas de videoconferencia para que la Inteligencia Artificial los analice de forma privada.
                </p>

                <div className="space-y-3.5">
                  <div className="p-3.5 bg-white border border-slate-100 rounded-2xl">
                    <h5 className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="text-sky-500 font-extrabold">✔</span> Formatos de alta fidelidad
                    </h5>
                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                      Para mejores resultados de transcripción de voz automática, utiliza formatos WAV, MP3 limpios u originarios de grabadoras digitales de voz.
                    </p>
                  </div>

                  <div className="p-3.5 bg-white border border-slate-100 rounded-2xl">
                    <h5 className="text-[11px] font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="text-teal-550 font-extrabold">✔</span> Seguridad Completa
                    </h5>
                    <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                      Los archivos de audio se analizan localmente o mediante la Gemini API de forma transitoria para extraer la transcripción y el resumen inteligente. Tus datos nunca se usan para entrenamiento.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                <span>Límite de Carga: 100 Megabytes</span>
                <span className="text-[#1591DC]">Cifrado Activo</span>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Model processing/transcribing screen loading layover */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white/95 backdrop-blur-xs flex flex-col items-center justify-center z-30 p-6 text-center"
          >
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-xl border border-slate-100 flex items-center justify-center text-[#2C5EAD] bg-slate-50">
                <Brain className="w-8 h-8 animate-pulse" />
              </div>
              <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1591DC] text-white flex items-center justify-center text-[10px] font-bold shadow-sm animate-bounce">
                AI
              </div>
            </div>

            <h3 className="text-sm font-bold text-slate-800">
              Procesando Ondas de Audio...
            </h3>
            
            {/* Spinning indicator */}
            <div className="w-48 bg-slate-100 h-1 rounded-full overflow-hidden mt-4 mb-3">
              <div className="bg-[#1591DC] h-full w-2/3 rounded-full animate-[progress_1.5s_infinite_linear]" style={{
                animationName: "progress",
                backgroundImage: "linear-gradient(90deg, #2C5EAD 0%, #1591DC 50%, #4BB8FA 100%)"
              }} />
            </div>

            <p className="text-[11px] text-slate-400 min-h-4 tracking-wide font-medium">
              {processingStatus}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}
