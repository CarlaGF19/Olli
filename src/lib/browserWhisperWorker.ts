/// <reference lib="webworker" />

import { env, pipeline } from "@xenova/transformers";

type WorkerRequest =
  | { id: number; type: "warmup" }
  | { id: number; type: "transcribe"; audio: Float32Array };

const ctx: DedicatedWorkerGlobalScope = self as any;
const MODEL_ID = "Xenova/whisper-tiny";

env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriberPromise: Promise<any> | null = null;

function getTranscriber() {
  if (!transcriberPromise) {
    transcriberPromise = pipeline("automatic-speech-recognition", MODEL_ID, {
      quantized: true,
      progress_callback: (progress: any) => {
        ctx.postMessage({
          type: "progress",
          status: progress?.status || "loading",
          file: progress?.file || "",
          progress: progress?.progress || 0,
        });
      },
    });
  }

  return transcriberPromise;
}

ctx.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { id, type } = event.data;

  try {
    const transcriber = await getTranscriber();

    if (type === "warmup") {
      ctx.postMessage({ id, type: "ready" });
      return;
    }

    const output = await transcriber(event.data.audio, {
      language: "spanish",
      task: "transcribe",
      chunk_length_s: 20,
      stride_length_s: 4,
    });

    const transcript = Array.isArray(output)
      ? output.map((item) => item?.text || "").join(" ")
      : output?.text || "";

    ctx.postMessage({
      id,
      type: "result",
      transcript: transcript.replace(/\s+/g, " ").trim(),
    });
  } catch (error: any) {
    ctx.postMessage({
      id,
      type: "error",
      error: error?.message || "No se pudo transcribir con Whisper local en el navegador.",
    });
  }
};
