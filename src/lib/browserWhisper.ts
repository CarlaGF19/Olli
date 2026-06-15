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

async function decodeToMono16k(blob: Blob) {
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  const audioContext = new AudioCtx();
  const arrayBuffer = await blob.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

  const targetSampleRate = 16000;
  const offlineContext = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate
  );

  const source = offlineContext.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineContext.destination);
  source.start(0);

  const rendered = await offlineContext.startRendering();
  await audioContext.close().catch(() => {});

  return new Float32Array(rendered.getChannelData(0));
}

export async function warmupBrowserWhisper() {
  if (!isBrowserWhisperSupported()) {
    throw new Error("Este navegador no soporta Whisper local en Web Worker.");
  }

  await requestWorker("warmup");
}

export async function transcribeAudioInBrowser(blob: Blob) {
  if (!isBrowserWhisperSupported()) {
    throw new Error("Este navegador no soporta transcripcion local dentro de la web.");
  }

  const audio = await decodeToMono16k(blob);
  return requestWorker("transcribe", audio);
}
