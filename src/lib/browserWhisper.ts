type PendingRequest = {
  resolve: (value: string) => void;
  reject: (reason?: unknown) => void;
};

let worker: Worker | null = null;
let requestId = 0;
const pending = new Map<number, PendingRequest>();

export function isBrowserWhisperSupported() {
  return (
    typeof window !== "undefined" &&
    typeof Worker !== "undefined" &&
    !!(window.AudioContext || (window as any).webkitAudioContext)
  );
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./browserWhisperWorker.ts", import.meta.url), {
      type: "module",
    });

    worker.onmessage = (event: MessageEvent<any>) => {
      const { id, type, transcript, error } = event.data || {};

      if (type === "progress") return;

      const request = pending.get(id);
      if (!request) return;

      pending.delete(id);

      if (type === "error") {
        request.reject(new Error(error || "Whisper local no pudo transcribir este segmento."));
        return;
      }

      request.resolve(transcript || "");
    };

    worker.onerror = (event) => {
      pending.forEach((request) => request.reject(event.error || new Error(event.message)));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }

  return worker;
}

function requestWorker(type: "warmup" | "transcribe", audio?: Float32Array) {
  const id = ++requestId;
  const activeWorker = getWorker();

  return new Promise<string>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    if (type === "transcribe" && audio) {
      activeWorker.postMessage({ id, type, audio }, [audio.buffer]);
      return;
    }

    activeWorker.postMessage({ id, type });
  });
}

function resampleTo16k(input: Float32Array, sourceSampleRate: number) {
  const targetSampleRate = 16000;
  if (sourceSampleRate === targetSampleRate) {
    return new Float32Array(input);
  }

  const ratio = sourceSampleRate / targetSampleRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sourceIndex = i * ratio;
    const index = Math.floor(sourceIndex);
    const nextIndex = Math.min(index + 1, input.length - 1);
    const weight = sourceIndex - index;
    output[i] = input[index] * (1 - weight) + input[nextIndex] * weight;
  }

  return output;
}

export async function warmupBrowserWhisper() {
  if (!isBrowserWhisperSupported()) {
    throw new Error("Este navegador no soporta Whisper local en Web Worker.");
  }

  await requestWorker("warmup");
}

export async function transcribePcmInBrowser(audio: Float32Array, sampleRate: number) {
  if (!isBrowserWhisperSupported()) {
    throw new Error("Este navegador no soporta transcripcion local dentro de la web.");
  }

  return requestWorker("transcribe", resampleTo16k(audio, sampleRate));
}
