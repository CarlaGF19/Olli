/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Mic, Square, Play, Pause, UploadCloud, FileAudio, AlertCircle, Sparkles, Brain } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AudioRecorderProps {
  onTranscriptionSuccess: (transcription: { title: string; transcript: string; summary: string }, durationSec: number) => void;
  settings: { aiProvider: string; apiKey: string };
}

export default function AudioRecorder({ onTranscriptionSuccess, settings }: AudioRecorderProps) {
  // Tabs: "record" or "upload"
  const [activeMode, setActiveMode] = useState<"record" | "upload">("record");

  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState("");

  // Refs for audio capturing
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
    setErrorMessage("");
    setDuration(0);
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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

      // Setup active ticking counter
      timerIntervalRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);

    } catch (err: any) {
      console.error("Acoustic setup failed:", err);
      // Give extremely polite guidance on frame permission
      setErrorMessage(
        "Could not access your microphone space. Please verify browser permissions are granted for this page."
      );
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
      } else {
        mediaRecorderRef.current.pause();
        setIsPaused(true);
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      stopTracksAndTimers();
      setIsRecording(false);
      setIsPaused(false);
    }
  };

  // 3. Audio Transcribing Proxy API Request Handler
  const handleAudioProcess = async (blob: Blob, durationSec: number) => {
    setIsProcessing(true);
    setProcessingStatus("Preparing audio channels...");

    try {
      // 1. Read Blob as Base64 encoded string
      setProcessingStatus("Packaging workspace packet...");
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      const base64Promise = new Promise<string>((resolve) => {
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
      });
      const base64Data = await base64Promise;

      // 2. Call local `/api/transcribe` backend endpoint
      setProcessingStatus("Transcribing with Gemini Brain model...");
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio: base64Data,
          mimeType: blob.type || "audio/webm",
          apiKey: settings.apiKey,
          aiProvider: settings.aiProvider,
        }),
      });

      const json = await response.json();

      if (!response.ok) {
        throw new Error(json.error || "Acoustic transcription failure.");
      }

      setProcessingStatus("Summarizing timeline outline...");
      onTranscriptionSuccess(json, durationSec);

    } catch (err: any) {
      console.error("Transcription error details:", err);
      setErrorMessage(err.message || "Failed to process audio.");
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
      setErrorMessage("Unsupported file type. Please upload MP3, WAV or M4A audio formats.");
    }
  };

  const triggerUploadTranscribe = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setProcessingStatus("Loading files into memory...");

    try {
      // Estimate audio duration based on average packet size or arbitrary default value
      const durationSec = Math.round(selectedFile.size / 32000) || 60; // fallback math
      await handleAudioProcess(selectedFile, durationSec);
      setSelectedFile(null);
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to parse manual file.");
      setIsProcessing(false);
    }
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
          Mic Recorder
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
          Upload Audio File
        </button>
      </div>

      {/* Error state */}
      <AnimatePresence>
        {errorMessage && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-rose-50 border border-rose-100 rounded-xl text-xs font-medium text-rose-600 flex items-start space-x-3"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Acoustic Guard: </span>
              {errorMessage}
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
                <div className="text-slate-400 text-xs tracking-wider font-semibold uppercase mb-4">
                  Ready to Capture Notes
                </div>
                
                {/* Visual recording trigger button */}
                <button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="w-24 h-24 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer hover:bg-slate-100/50 relative shadow-sm group disabled:opacity-50"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#2C5EAD] to-[#1591DC] flex items-center justify-center text-white shadow-md shadow-[#2C5EAD]/20 group-hover:shadow-lg transition-all">
                    <Mic className="w-7 h-7" />
                  </div>
                </button>
                
                <h3 className="text-base font-bold text-[#2C5EAD] mt-6">
                  Initiate Audio Session
                </h3>
                <p className="text-xs text-slate-400 max-w-xs mt-1 leading-relaxed">
                  Press the microphone button to start a highly precise live session.
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
                  <span>Recording in progress</span>
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
                      Session Paused
                    </div>
                  )}
                </div>

                {/* formatted ticking clock */}
                <div className="text-4xl font-light text-slate-800 tracking-wider mb-6 font-mono font-medium">
                  {formatTimer(duration)}
                </div>

                {/* Otter.ai style reassure text */}
                <div className="max-w-sm mb-8 text-center px-4">
                  <p className="text-xs font-semibold text-slate-700">
                    Keep this window open while recording
                  </p>
                  <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                    MeetingBrain will automatically capture and transcribe your audio securely. Closing this window will stop the recording.
                  </p>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={pauseRecording}
                    className="p-3 bg-slate-50 hover:bg-slate-100 rounded-full border border-slate-200 text-slate-600 hover:text-slate-800 transition-all cursor-pointer shadow-xs active:scale-95"
                    title={isPaused ? "Resume Session" : "Pause Session"}
                  >
                    {isPaused ? <Play className="w-5 h-5 text-emerald-500 fill-emerald-500" /> : <Pause className="w-5 h-5" />}
                  </button>
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white rounded-full flex items-center space-x-2 font-semibold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-rose-500/10 hover:shadow-lg hover:shadow-rose-500/15 active:scale-95"
                  >
                    <Square className="w-4 h-4 fill-white" />
                    <span>Stop & Transcribe</span>
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
              Drag & Drop your meeting files here
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Supports MP3, WAV or M4A formats (Max 100MB)
            </p>
            
            <button
              type="button"
              className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200/80 text-slate-600 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              Browse Files
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
                Transcribe File
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
              Processing Audio Waves...
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
