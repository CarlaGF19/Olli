/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, UploadCloud, FileAudio, AlertCircle, Sparkles, Brain, Tv, Volume2, FileDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { jsPDF } from "jspdf";

interface AudioRecorderProps {
  onTranscriptionSuccess: (transcription: { id?: string; title: string; transcript: string; summary: string }, durationSec: number) => void;
  settings: { aiProvider: string; apiKey: string; bypassSizeLimit?: boolean };
  onUpdateDraft?: (draft: { id: string; title: string; transcript: string; summary: string; duration: string; isDraft?: boolean; date?: string }) => void;
}

export default function AudioRecorder({ onTranscriptionSuccess, settings, onUpdateDraft }: AudioRecorderProps) {
  // Tabs: "record" or "upload"
  const [activeMode, setActiveMode] = useState<"record" | "upload">("record");

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
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

  // Cumulative speech recognition trackers
  const sessionFinalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
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

  useEffect(() => {
    stopRecordingRef.current = stopRecording;
  });

  // File Upload states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Clean-up refs on unmount
  useEffect(() => {
    return () => {
      stopTracksAndTimers();
    };
  }, []);

  const stopTracksAndTimers = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      audioContextRef.current.close();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch (e) {}
      recognitionRef.current = null;
    }
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
      if (!isRecording) return;
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
    setDuration(0);
    sessionFinalTranscriptRef.current = "";
    liveTranscriptRef.current = "";
    setLiveTranscript("");
    setInterimTranscript("");
    setDraftWordCount(0);
    setFailedSessionData(null);
    audioChunksRef.current = [];

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
      let stream: MediaStream;
      if (captureSource === "screen") {
        try {
          let displayStream: MediaStream;
          try {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: {
                displaySurface: "browser"
              },
              audio: {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
              } as any,
              selfBrowserSurface: "exclude",
              systemAudio: "include"
            } as any);
          } catch (e) {
            displayStream = await navigator.mediaDevices.getDisplayMedia({
              video: true,
              audio: true
            });
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
          audioTracks.forEach((track) => {
            track.onended = () => {
              if (stopRecordingRef.current) {
                stopRecordingRef.current();
              }
            };
          });

          const videoTracks = displayStream.getVideoTracks();
          // Retrasamos la detención de la pista de video unos instantes (350ms) para darle
          // tiempo al navegador (como Chrome o Edge) de posicionar y renderizar su barra
          // informativa de forma correcta, evitando el error visual de doble pestaña "laggeada" o solapada.
          setTimeout(() => {
            videoTracks.forEach((track) => {
              try {
                if (track.readyState === "live") {
                  track.stop();
                }
              } catch (err) {
                console.warn("No se pudo detener la pista de video de forma segura:", err);
              }
            });
          }, 350);
          
          stream = new MediaStream(audioTracks);
        } catch (err: any) {
          if (err.name === "NotAllowedError" || err.message?.includes("Permission denied")) {
            throw new Error("Permiso de captura cancelado o denegado por el usuario.");
          }
          throw err;
        }
      } else {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      streamRef.current = stream;

      // Instantiate HTML MediaRecorder
      const options = { mimeType: "audio/webm" };
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
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        await handleAudioProcess(audioBlob, duration);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start(250); // Fetch packets in 250ms chunks

      setIsRecording(true);
      setIsPaused(false);
      startVisualizer(stream);

      // Web Speech API for Real-time Live Transcription
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
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

          if (onUpdateDraft && currentDraftIdRef.current) {
            setIsSyncingDraft(true);
            const m = Math.floor(duration / 60);
            const s = duration % 60;
            const liveDurationFormatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
            onUpdateDraft({
              id: currentDraftIdRef.current,
              title: `Borrador en Vivo: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
              transcript: fullText,
              summary: "### Borrador Guardado en Tiempo Real\n\nEste es un borrador auto-guardado mientras hablabas. Si la transcripción del audio pesado falla, puedes usar la opción de IA para resumir este borrador de texto directamente en tu bóveda.",
              duration: liveDurationFormatted,
              isDraft: true,
              date: new Date().toISOString()
            });
            setTimeout(() => {
              setIsSyncingDraft(false);
            }, 500);
          }
        };

        recognition.onerror = (e: any) => {
          console.warn("Speech recognition error:", e);
        };

        recognition.onend = () => {
          // Capture cumulative text from this session before restarting
          sessionFinalTranscriptRef.current = liveTranscriptRef.current;

          // Restart recognition if recording is still active to avoid timeout stops
          if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording" && !isPaused) {
            try {
              recognition.start();
            } catch (err) {}
          }
        };

        recognitionRef.current = recognition;
        try {
          recognition.start();
        } catch (e) {
          console.error("Speech recognition start failed:", e);
        }
      }

      // Setup active ticking counter
      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => {
          const next = prev + 1;
          if (next % 5 === 0 && onUpdateDraft && currentDraftIdRef.current) {
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
            }, 500);
          }
          return next;
        });
      }, 1000);

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
        setIsPaused(false);
        // Resume timer
        timerIntervalRef.current = setInterval(() => {
          setDuration((prev) => prev + 1);
        }, 1000);
        // Resume SpeechRecognition
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {}
        }
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        // Pause SpeechRecognition
        if (recognitionRef.current) {
          try {
            recognitionRef.current.stop();
          } catch (e) {}
        }
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      // Stop SpeechRecognition immediately
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (e) {}
        recognitionRef.current = null;
      }
      mediaRecorderRef.current.stop();
      stopTracksAndTimers();
      setIsRecording(false);
      setIsPaused(false);
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
          throw new Error(`El audio grabado es demasiado pesado (${(payloadSizeBytes / (1024 * 1024)).toFixed(2)} MB). Las funciones Serverless de Vercel limitan las transferencias de subida a un máximo de 4.5 MB. Te sugerimos realizar grabaciones más cortas o activar 'Desactivar límites de tamaño de audio' en Settings si corres localmente, en VPS o en Cloud Run.`);
        }
      }

      // 2. Call local `/api/transcribe` backend endpoint or direct client call
      let json;
      const isCustomKeyValid = settings.apiKey && settings.apiKey.trim().startsWith("AIzaSy");

      if (isCustomKeyValid && settings.aiProvider === "gemini") {
        setProcessingStatus("Transcribiendo directamente en tu navegador con tu API Key (sin límite de servidor)...");
        const systemPrompt = `You are MeetingBrain, an elite AI tool designed to transcribe recordings and output gorgeous Notion & Obsidian styled meeting summaries.
Analyze the audio file provided and generate the response in the language spoken in the audio.
CRITICAL: If the language of the audio is Spanish, the 'title', 'transcript', and 'summary' MUST be generated entirely in Spanish. Do NOT translate Spanish speech or summaries into English. Default to Spanish when in doubt.

Specifically, generate:
1. Exact verbatim transcript in the native spoken language. EVERY sentence or speaker change MUST begin with a precise, chronological timestamp indicating exactly when it is spoken in the format '[MM:SS] Speaker: ...' (e.g., "[00:04] Speaker 1: Hola...", "[00:15] Speaker 2: Sí, claro..."). Detail the turns meticulously and timeline everything precisely.
2. Obsidian-style summary in the native spoken language, featuring chapters with duration timestamps, clean outlines, and bulleted checklist tasks like [ ] or [x] for clear action items.
3. A short, creative title in the native spoken language summarizing the conversation.`;

        let userPrompt = "Realiza una transcripción precisa de este audio y presenta notas estructuradas en el mismo idioma en que se habla (por defecto, español si el audio es en español).";
        if (liveTranscript && liveTranscript.trim().length > 0) {
          userPrompt += `\n\nReference Live Speech Draft for context and text correction:\n"""\n${liveTranscript}\n"""\nUse the above draft to correct spelling of names or terms, alignment, and format the official transcription with precise timestamps from the audio file.`;
        }

        // Clean base64 pattern (remove prefix if present)
        let cleanBase64 = base64Data;
        if (cleanBase64.includes(";base64,")) {
          cleanBase64 = cleanBase64.split(";base64,")[1];
        }

        const directUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${settings.apiKey.trim()}`;
        const directResponse = await fetch(directUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType: blob.type || "audio/webm",
                      data: cleanBase64,
                    },
                  },
                  {
                    text: userPrompt,
                  },
                ],
              },
            ],
            systemInstruction: {
              parts: [
                {
                  text: systemPrompt,
                },
              ],
            },
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  title: {
                    type: "STRING",
                    description: "Snappy, clean meeting title, e.g., 'Weekly Standup & Milestone Planning'.",
                  },
                  transcript: {
                    type: "STRING",
                    description: "Full, precise, verbatim transcript of everything spoken in the audio, formatted with detailed chronological [MM:SS] speaker labels.",
                  },
                  summary: {
                    type: "STRING",
                    description: "Fully styled Markdown summary with headings, key insights, bulleted points, and checklist items.",
                  },
                },
                required: ["title", "transcript", "summary"],
              },
            },
          }),
        });

        const directRawText = await directResponse.text();
        if (!directResponse.ok) {
          let errorDetail = directRawText;
          try {
            const errJson = JSON.parse(directRawText);
            errorDetail = errJson.error?.message || errorDetail;
          } catch (_) {
            // ignore
          }
          throw new Error(`Error en llamada directa a Gemini desde navegador: ${errorDetail}`);
        }

        let directResult;
        try {
          directResult = JSON.parse(directRawText);
        } catch (_) {
          throw new Error(`Error en la respuesta de Gemini (no es JSON válido): ${directRawText.substring(0, 150)}...`);
        }
        const textResponse = directResult.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textResponse) {
          throw new Error("No se recibió respuesta estructurada de la llamada directa.");
        }

        try {
          json = JSON.parse(textResponse);
        } catch (parseError) {
          throw new Error("La respuesta directa de Gemini no contiene un JSON estructurado válido.");
        }

      } else {
        setProcessingStatus("Transcribiendo y analizando con Gemini AI...");
        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            audio: base64Data,
            mimeType: blob.type || "audio/webm",
            apiKey: settings.apiKey,
            aiProvider: settings.aiProvider,
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
            // Fallback to analyze raw HTML / text or custom status errors from proxy layers like Vercel/Cloud Run
            if (rawText.includes("Payload Too Large") || response.status === 413) {
              errorMsg = "El audio es demasiado pesado. Las funciones sin servidor de Vercel limitan las subida a 4.5 MB. Por favor realiza grabaciones de menor duración.";
            } else if (response.status === 504 || response.status === 502 || rawText.toLowerCase().includes("timeout")) {
              errorMsg = "La solicitud de transcripción con Gemini ha superado el tiempo límite de ejecución en Vercel (límite por defecto de 10-60 segundos). Intenta grabar un audio más corto.";
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
      }

      setProcessingStatus("Generando resumen ejecutivo y tareas de Obsidian...");
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
    const textToPrint = liveTranscriptRef.current || liveTranscript || "(Sin palabras transcritas aún)";
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxLineWidth = pageWidth - (margin * 2);

    let yPosition = 25;

    const drawPageBackground = () => {
      // Top accent bar overlay
      doc.setFillColor(44, 94, 173); // #2C5EAD
      doc.rect(0, 0, pageWidth, 4, "F");

      // Footer
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Grabación Sincronizada en Vivo  |  MeetingBrain`, margin, pageHeight - 10);
      const pageNum = doc.getNumberOfPages();
      doc.text(`Pág. ${pageNum}`, pageWidth - margin - 15, pageHeight - 10);
    };

    drawPageBackground();

    // Title
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(26, 37, 58);
    doc.text(`Borrador Transcrito en Tiempo Real`, margin, yPosition);
    yPosition += 10;

    // Metadata
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    const m = Math.floor(duration / 60);
    const s = duration % 60;
    const liveDurationFormatted = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    doc.text(`Fecha: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}  |  Duración de Audio: ${liveDurationFormatted}`, margin, yPosition);
    yPosition += 12;

    // Line separator
    doc.setDrawColor(230, 230, 230);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Body text
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(60, 60, 60);

    const textLines = doc.splitTextToSize(textToPrint, maxLineWidth);
    for (const line of textLines) {
      if (yPosition > pageHeight - margin - 10) {
        doc.addPage();
        drawPageBackground();
        yPosition = 25;
      }
      doc.text(line, margin, yPosition);
      yPosition += 6.5;
    }

    doc.save(`MeetingBrain_Borrador_Sincronizado_${Date.now()}.pdf`);
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

  return (
    <div id="audio_recorder_box" className="bg-white border text-sans border-slate-100/80 rounded-3xl p-8 max-md:p-6 select-none relative overflow-hidden shadow-xl shadow-slate-200/40">
      
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
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-medium text-rose-600 flex items-start space-x-3 text-left"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div>
                <span className="font-bold">Acoustic Guard: </span>
                {errorMessage}
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

      {/* Mode Renderers */}
      {activeMode === "record" ? (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          
          <AnimatePresence mode="wait">
            {!isRecording ? (
              <motion.div
                key="start-screen"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center"
              >
                <div className="text-slate-400 text-xs tracking-wider font-semibold uppercase mb-3">
                  Fuente de Captura de Audio
                </div>

                {/* Audio Capture Source Selector */}
                <div className="flex bg-slate-100 p-1 rounded-xl mb-5 space-x-1 max-w-sm w-full">
                  <button
                    type="button"
                    onClick={() => setCaptureSource("mic")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      captureSource === "mic"
                        ? "bg-white text-[#2C5EAD] shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Mi Micrófono</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCaptureSource("screen")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center space-x-1.5 transition-all cursor-pointer ${
                      captureSource === "screen"
                        ? "bg-white text-[#2C5EAD] shadow-sm"
                        : "text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>Audio de Reunión (Digital)</span>
                  </button>
                </div>

                {captureSource === "screen" && (
                  <div className="mb-6 p-4 bg-sky-50 border border-sky-100 rounded-xl text-[11px] text-sky-700 max-w-md text-left leading-relaxed">
                    
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
                
                {/* Visual recording trigger button */}
                <button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="w-24 h-24 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer hover:bg-slate-100/50 relative shadow-sm group disabled:opacity-50 mt-2"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#2C5EAD] to-[#1591DC] flex items-center justify-center text-white shadow-md shadow-[#2C5EAD]/20 group-hover:shadow-lg transition-all">
                    {captureSource === "screen" ? <Tv className="w-7 h-7" /> : <Mic className="w-7 h-7" />}
                  </div>
                </button>
                
                <h3 className="text-base font-bold text-[#2C5EAD] mt-5">
                  {captureSource === "screen" ? "Grabar Audio Digital" : "Grabar por Micrófono"}
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
                  {captureSource === "screen" 
                    ? "Presiona el botón para seleccionar la pestaña y capturar el audio digital en vivo."
                    : "Presiona el botón para iniciar la captura usando tu micrófono ambiental."
                  }
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="recording-screen"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="w-full flex flex-col items-center"
              >
                {/* Glowing recording node indicator */}
                <div className="flex items-center space-x-2 bg-emerald-50 text-emerald-600 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest leading-none mb-6">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Grabación en curso...</span>
                </div>

                {/* Aesthetic Visualizer canvas */}
                <div className="w-full max-w-md h-24 bg-slate-50/50 border border-slate-100 rounded-xl mb-6 relative overflow-hidden flex items-center justify-center">
                  <canvas
                    ref={canvasRef}
                    width={400}
                    height={96}
                    className="w-full h-full block"
                  />
                  {isPaused && (
                    <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex items-center justify-center text-xs font-semibold text-slate-500 uppercase tracking-widest">
                      Sesión Pausada
                    </div>
                  )}
                </div>

                {/* formatted ticking clock */}
                <div className="text-4xl font-light text-slate-800 tracking-wider mb-6 font-mono font-medium">
                  {formatTimer(duration)}
                </div>

                {/* 🔴 LIVE TRANSCRIPTION PANEL */}
                <div className="w-full max-w-md bg-slate-50 border border-slate-100/80 rounded-2xl p-4 mb-6 relative overflow-hidden flex flex-col items-start text-left shadow-inner">
                  <div className="flex items-center space-x-2 text-[10px] font-bold text-rose-500 uppercase tracking-widest mb-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse inline-block" style={{ width: "6px", height: "6px" }} />
                    <span>Transcripción en Vivo Transmitiendo</span>
                  </div>
                  
                  <div className="w-full h-24 overflow-y-auto font-sans text-xs text-slate-600 leading-relaxed scroll-smooth pr-1" style={{ maxHeight: "96px" }}>
                    {liveTranscript || interimTranscript ? (
                      <div className="space-y-1">
                        <span className="text-slate-700 font-medium">{liveTranscript}</span>
                        {interimTranscript && (
                          <span className="text-slate-400 italic font-medium"> {interimTranscript}</span>
                        )}
                      </div>
                    ) : (
                      <div className="text-slate-400 italic text-[11px] py-6 text-center w-full">
                        Hable claramente para ver la transcripción en vivo en español...
                      </div>
                    )}
                  </div>

                  {/* Live Sync and PDF generation toolbar */}
                  <div className="w-full mt-3 pt-3 border-t border-slate-100/80 flex items-center justify-between text-[11px] text-slate-500 font-medium">
                    <div className="flex items-center space-x-1.5 text-emerald-600 font-semibold">
                      <Check className="w-3.5 h-3.5 stroke-[3px]" />
                      <span className="animate-pulse">{isSyncingDraft ? "Autoguardando Bóveda..." : "Sincronizado con PDF"}</span>
                    </div>
                    <button
                      type="button"
                      onClick={downloadLivePDF}
                      disabled={!liveTranscript && !interimTranscript}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 bg-[#2C5EAD] hover:bg-[#1591DC] text-white rounded-lg text-[10px] font-bold transition-all shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <FileDown className="w-3 h-3" />
                      <span>Recuperar PDF (.pdf)</span>
                    </button>
                  </div>
                </div>

                {/* Otter.ai style reassure text */}
                <div className="max-w-sm mb-8 text-center px-4">
                  <p className="text-xs font-semibold text-slate-700">
                    Mantén esta pestaña abierta mientras grabas
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    MeetingBrain capturará y transcribirá tu audio de forma segura en tiempo real. Cerrar esta ventana detendrá la grabación.
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={pauseRecording}
                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 text-slate-600 hover:text-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
                    title={isPaused ? "Reanudar Sesión" : "Pausar Sesión"}
                  >
                    {isPaused ? <Play className="w-5 h-5 text-emerald-500 fill-emerald-500" /> : <Pause className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center space-x-2 font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-rose-500/10 hover:shadow-lg hover:shadow-rose-500/15 active:scale-95"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Terminar y Transcribir</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      ) : (
        <div className="py-2">
          {/* Audio Upload Pane */}
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed border-slate-200 hover:border-[#1591DC] hover:bg-slate-50/50 rounded-2xl py-12 px-6 text-center cursor-pointer transition-all ${
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
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Buscar Archivos
            </button>
          </div>

          {selectedFile && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 bg-slate-50/70 border border-slate-100 rounded-2xl flex items-center justify-between"
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
