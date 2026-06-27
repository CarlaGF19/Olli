import express from "express";
import path from "path";
import fs from "fs";
import { randomInt } from "crypto";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import nodemailer from "nodemailer";
import {
  createMeetingFolder,
  deleteAccountPermanently,
  deleteMeetingFolder,
  deleteMeeting,
  getAccountDeletionPreview,
  getSettings,
  getUserFromSession,
  listMeetingFolders,
  listMeetings,
  loginLocalUser,
  logoutLocalSession,
  PublicLocalUser,
  registerLocalUser,
  resetLocalPassword,
  saveMeeting,
  saveSettings,
  updateMeeting,
} from "./localDb";

function isValidGeminiApiKey(key: string | undefined): boolean {
  if (!key) return false;
  const cleanKey = key.trim();
  if (cleanKey === "" || cleanKey.toUpperCase() === "MY_GEMINI_API_KEY") {
    return false;
  }
  return true;
}

function toFriendlyGeminiError(error: any): string {
  const raw = typeof error?.message === "string" ? error.message : String(error || "");
  const lower = raw.toLowerCase();

  if (raw.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "Gemini alcanzó el límite de cuota de tu API key. Espera a que se renueve la cuota o usa otra clave en Settings.";
  }

  if (raw.includes("401") || raw.includes("403") || lower.includes("api key") || lower.includes("permission")) {
    return "La API key de Gemini no es válida o no tiene permisos. Revisa la clave guardada en Settings.";
  }

  if (lower.includes("payload") || raw.includes("413")) {
    return "El audio es demasiado pesado para procesarlo de una sola vez. Intenta una grabación más corta.";
  }

  return raw.length > 240 ? `${raw.slice(0, 240)}...` : raw;
}

// Load environment variables (from .env/process.env)
dotenv.config();

const app = express();
const PORT = Number.parseInt(process.env.PORT || "3000", 10) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const MAX_GENERAL_JSON_BYTES = 8 * 1024 * 1024;
const MAX_AI_TEXT_CHARS = 180_000;
const MAX_CHAT_HISTORY_MESSAGES = 12;
const MAX_AUDIO_BASE64_BYTES = 42 * 1024 * 1024;
const MAX_PDF_BASE64_BYTES = 10 * 1024 * 1024;
const ACCOUNT_DELETION_CODE_TTL_MS = 3 * 60 * 1000;
const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/ogg",
  "audio/ogg;codecs=opus",
]);

app.disable("x-powered-by");
if (IS_PRODUCTION) {
  app.set("trust proxy", 1);
}

app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), geolocation=(), payment=(), usb=()");
  if (IS_PRODUCTION) {
    res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
  }
  next();
});

// Keep ordinary API payloads small. Audio transcription is the only route allowed to send larger base64 data.
app.use((req, res, next) => {
  const limit = req.path === "/api/transcribe" ? "60mb" : "8mb";
  return express.json({ limit })(req, res, next);
});
app.use(express.urlencoded({ limit: "1mb", extended: true }));

const SESSION_COOKIE = "mb_session";
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: express.Request) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function rateLimit(options: {
  name: string;
  windowMs: number;
  max: number;
  includeUser?: boolean;
}) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const user = (req as any).localUser as PublicLocalUser | undefined;
    const identity = options.includeUser && user ? `user:${user.uid}` : `ip:${getClientIp(req)}`;
    const key = `${options.name}:${identity}`;
    const current = rateLimitBuckets.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    if (current.count >= options.max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        error: "Demasiadas peticiones. Espera un momento antes de intentarlo de nuevo.",
      });
    }

    current.count += 1;
    return next();
  };
}

const authRateLimit = rateLimit({ name: "auth", windowMs: 15 * 60 * 1000, max: 20 });
const resetPasswordRateLimit = rateLimit({ name: "reset-password", windowMs: 60 * 60 * 1000, max: 8 });
const writeRateLimit = rateLimit({ name: "write", windowMs: 15 * 60 * 1000, max: 160, includeUser: true });
const aiRateLimit = rateLimit({ name: "ai", windowMs: 60 * 60 * 1000, max: 30, includeUser: true });
const transcribeRateLimit = rateLimit({ name: "transcribe", windowMs: 60 * 60 * 1000, max: 10, includeUser: true });
const emailRateLimit = rateLimit({ name: "email", windowMs: 60 * 60 * 1000, max: 8, includeUser: true });
const accountDeletionRateLimit = rateLimit({ name: "account-deletion", windowMs: 15 * 60 * 1000, max: 8, includeUser: true });

const accountDeletionCodes = new Map<string, { code: string; expiresAt: number; attempts: number }>();

function createNumericDeletionCode() {
  return String(randomInt(100000, 1000000));
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) rateLimitBuckets.delete(key);
  }
  for (const [userId, challenge] of accountDeletionCodes.entries()) {
    if (challenge.expiresAt <= now) accountDeletionCodes.delete(userId);
  }
}, 10 * 60 * 1000).unref();

function validateJsonPayloadSize(req: express.Request, maxBytes = MAX_GENERAL_JSON_BYTES) {
  const lengthHeader = req.headers["content-length"];
  const length = typeof lengthHeader === "string" ? Number.parseInt(lengthHeader, 10) : 0;
  if (Number.isFinite(length) && length > maxBytes) {
    const error = new Error("La peticion es demasiado grande.");
    (error as any).status = 413;
    throw error;
  }
}

function normalizeText(value: unknown, maxChars: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxChars);
}

type GeneratedMeetingAnalysis = {
  overview: string;
  keyPoints: string[];
  actionItems: string[];
  outline: Array<{ heading: string; items: string[] }>;
  additionalNotes: string[];
};

function normalizeAnalysisList(value: unknown, maxItems = 12, maxChars = 600) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normalizeGeneratedAnalysis(value: unknown): GeneratedMeetingAnalysis {
  if (!value || typeof value !== "object") {
    throw new Error("La IA no devolvio un analisis estructurado valido.");
  }
  const raw = value as Record<string, unknown>;
  const outline = Array.isArray(raw.outline)
    ? raw.outline
      .map((item) => {
        const section = item && typeof item === "object" ? item as Record<string, unknown> : {};
        return {
          heading: normalizeText(section.heading, 180),
          items: normalizeAnalysisList(section.items, 8, 420),
        };
      })
      .filter((item) => item.heading || item.items.length > 0)
      .slice(0, 10)
    : [];
  const overview = normalizeText(raw.overview, 6000);
  if (!overview) {
    throw new Error("La IA no devolvio un resumen general valido.");
  }
  return {
    overview,
    keyPoints: normalizeAnalysisList(raw.keyPoints),
    actionItems: normalizeAnalysisList(raw.actionItems),
    outline,
    additionalNotes: normalizeAnalysisList(raw.additionalNotes),
  };
}
function isProbablyBase64(value: string) {
  return /^[A-Za-z0-9+/=\s]+$/.test(value);
}

function getBase64Bytes(value: string) {
  const clean = value.replace(/\s/g, "");
  return Math.floor((clean.length * 3) / 4);
}

function cleanBase64Payload(value: unknown, maxBytes: number) {
  if (typeof value !== "string" || !value.trim()) {
    throw Object.assign(new Error("Faltan datos base64."), { status: 400 });
  }
  const raw = value.includes(";base64,") ? value.split(";base64,")[1] : value;
  const clean = raw.replace(/\s/g, "");
  if (!isProbablyBase64(clean)) {
    throw Object.assign(new Error("El archivo enviado no tiene formato base64 valido."), { status: 400 });
  }
  if (getBase64Bytes(clean) > maxBytes) {
    throw Object.assign(new Error("El archivo supera el limite permitido."), { status: 413 });
  }
  return clean;
}

function isValidEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 254;
}

function safeErrorMessage(error: any, fallback: string) {
  if (IS_PRODUCTION) return fallback;
  const message = typeof error?.message === "string" ? error.message : "";
  return message.length > 220 ? `${message.slice(0, 220)}...` : message || fallback;
}

function readCookie(req: express.Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  const found = raw
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${name}=`));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function setSessionCookie(res: express.Response, token: string) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
    maxAge: 14 * 24 * 60 * 60 * 1000,
  });
}

function clearSessionCookie(res: express.Response) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    path: "/",
  });
}

async function requireLocalUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const user = await getUserFromSession(readCookie(req, SESSION_COOKIE));
    if (!user) {
      return res.status(401).json({ error: "Sesion local expirada o no iniciada." });
    }
    (req as any).localUser = user;
    next();
  } catch (error) {
    next(error);
  }
}

async function resolveUserGeminiApiKey(req: express.Request) {
  const user = (req as any).localUser as PublicLocalUser | undefined;
  const userSettings = user ? await getSettings(user.uid, true) : null;
  const localKey = userSettings?.apiKey?.trim();
  const envKey = process.env.GEMINI_API_KEY?.trim();
  const resolvedApiKey = isValidGeminiApiKey(localKey) ? localKey : envKey;
  if (!isValidGeminiApiKey(resolvedApiKey)) {
    throw new Error("Configura una API Key de Gemini en Settings antes de usar funciones de IA.");
  }
  return resolvedApiKey;
}

// Lazy initializer for Google GenAI client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined. Please add it to your Secrets in the AI Studio platform Settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// REST API Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Olli backend is fully operational" });
});

// Local authentication and SQLite data routes
app.post("/api/auth/register", authRateLimit, async (req, res): Promise<any> => {
  try {
    validateJsonPayloadSize(req, 32 * 1024);
    const { username, email, password } = req.body;
    const result = await registerLocalUser(username || "", email || "", password || "");
    setSessionCookie(res, result.sessionToken);
    return res.json({
      user: result.user,
      recoveryCode: result.recoveryCode,
    });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "No se pudo crear la cuenta local." });
  }
});

app.post("/api/auth/login", authRateLimit, async (req, res): Promise<any> => {
  try {
    validateJsonPayloadSize(req, 16 * 1024);
    const { identifier, password } = req.body;
    const result = await loginLocalUser(identifier || "", password || "");
    setSessionCookie(res, result.sessionToken);
    return res.json({ user: result.user });
  } catch (error: any) {
    return res.status(401).json({ error: error.message || "No se pudo iniciar sesion." });
  }
});

app.post("/api/auth/logout", async (req, res): Promise<any> => {
  await logoutLocalSession(readCookie(req, SESSION_COOKIE));
  clearSessionCookie(res);
  return res.json({ ok: true });
});

app.get("/api/auth/me", async (req, res): Promise<any> => {
  const user = await getUserFromSession(readCookie(req, SESSION_COOKIE));
  if (!user) return res.status(401).json({ user: null });
  return res.json({ user });
});

app.post("/api/auth/reset-password", resetPasswordRateLimit, async (req, res): Promise<any> => {
  try {
    validateJsonPayloadSize(req, 16 * 1024);
    const { identifier, recoveryCode, newPassword } = req.body;
    const result = await resetLocalPassword(identifier || "", recoveryCode || "", newPassword || "");
    clearSessionCookie(res);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "No se pudo restablecer la contrasena." });
  }
});

app.get("/api/meetings", requireLocalUser, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  return res.json({ meetings: await listMeetings(user.uid) });
});

app.post("/api/meetings", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  await saveMeeting(user.uid, req.body);
  return res.json({ ok: true });
});

app.patch("/api/meetings/:id", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  await updateMeeting(user.uid, req.params.id, req.body);
  return res.json({ ok: true });
});

app.delete("/api/meetings/:id", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  await deleteMeeting(user.uid, req.params.id);
  return res.json({ ok: true });
});

app.get("/api/folders", requireLocalUser, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  return res.json({ folders: await listMeetingFolders(user.uid) });
});

app.post("/api/folders", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  try {
    validateJsonPayloadSize(req, 16 * 1024);
    const user = (req as any).localUser as PublicLocalUser;
    const folder = await createMeetingFolder(user.uid, req.body?.name || "");
    return res.json({ folder });
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "No se pudo crear la carpeta." });
  }
});

app.delete("/api/folders/:id", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  await deleteMeetingFolder(user.uid, req.params.id);
  return res.json({ ok: true });
});

app.get("/api/settings", requireLocalUser, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  return res.json({ settings: await getSettings(user.uid) });
});

app.put("/api/settings", requireLocalUser, writeRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  await saveSettings(user.uid, req.body);
  return res.json({ ok: true });
});

app.get("/api/account/deletion-preview", requireLocalUser, accountDeletionRateLimit, async (req, res): Promise<any> => {
  const user = (req as any).localUser as PublicLocalUser;
  const preview = await getAccountDeletionPreview(user.uid);
  const code = createNumericDeletionCode();
  const expiresAt = Date.now() + ACCOUNT_DELETION_CODE_TTL_MS;
  accountDeletionCodes.set(user.uid, { code, expiresAt, attempts: 0 });
  res.setHeader("Cache-Control", "no-store");
  return res.json({
    ...preview,
    confirmationCode: code,
    expiresAt: new Date(expiresAt).toISOString(),
    expiresInSeconds: Math.floor(ACCOUNT_DELETION_CODE_TTL_MS / 1000),
  });
});

app.delete("/api/account", requireLocalUser, accountDeletionRateLimit, async (req, res): Promise<any> => {
  validateJsonPayloadSize(req, 4 * 1024);
  const user = (req as any).localUser as PublicLocalUser;
  const confirmationCode = normalizeText(req.body?.confirmationCode, 12);
  const challenge = accountDeletionCodes.get(user.uid);

  if (!challenge || challenge.expiresAt <= Date.now()) {
    accountDeletionCodes.delete(user.uid);
    return res.status(400).json({ error: "El codigo de eliminacion expiro. Genera uno nuevo." });
  }

  if (challenge.attempts >= 5) {
    accountDeletionCodes.delete(user.uid);
    return res.status(429).json({ error: "Demasiados intentos fallidos. Genera un codigo nuevo." });
  }

  if (confirmationCode !== challenge.code) {
    challenge.attempts += 1;
    return res.status(400).json({ error: "Codigo de eliminacion incorrecto." });
  }

  const deleted = await deleteAccountPermanently(user.uid);
  accountDeletionCodes.delete(user.uid);
  clearSessionCookie(res);
  return res.json({
    ok: true,
    deletedBytes: deleted.estimatedBytes,
    deletedHumanSize: deleted.estimatedHumanSize,
  });
});

// Transcribe and analyze audio
app.post("/api/transcribe", requireLocalUser, transcribeRateLimit, async (req, res): Promise<any> => {
  try {
    const { audio, mimeType, promptOverride, liveDraftText, forceAudioTranscription } = req.body;
    const liveDraft = normalizeText(liveDraftText, MAX_AI_TEXT_CHARS);
    const shouldForceAudioTranscription = forceAudioTranscription === true;

    if (!audio) {
      return res.status(400).json({ error: "Missing audio data in base64 format." });
    }

    if (liveDraft.length > 0 && !shouldForceAudioTranscription) {
      try {
        const resolvedApiKey = await resolveUserGeminiApiKey(req);
        const ai = new GoogleGenAI({
          apiKey: resolvedApiKey,
          httpOptions: {
            headers: {
              "User-Agent": "meetbrain-local",
            },
          },
        });

        const response = await ai.models.generateContent({
          model: "gemini-3.5-flash",
          contents:
            "Resume esta transcripcion local en espanol. No corrijas inventando datos que no esten en el texto. " +
            "Extrae puntos clave y tareas solo si aparecen claramente.\n\n" +
            liveDraft,
          config: {
            systemInstruction:
              "You summarize local speech transcripts using only the supplied text. Keep the output factual and in Spanish. Use plain text with no Markdown, emojis, decorative separators, or invented tasks.",
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: {
                  type: Type.STRING,
                  description: "Short Spanish title for the session.",
                },
                summary: {
                  type: Type.STRING,
                  description: "Factual professional plain-text summary in Spanish based only on the transcript. No Markdown, emojis, or invented tasks.",
                },
              },
              required: ["title", "summary"],
            },
          },
        });

        const result = response.text ? JSON.parse(response.text) : {};
        return res.json({
          title: result.title || "Transcripcion local",
          transcript: liveDraft,
          summary: result.summary || "Transcripcion capturada localmente. No se genero resumen automatico.",
        });
      } catch (summaryError: any) {
        console.warn("Local draft summary skipped:", summaryError?.message || summaryError);
        return res.json({
          title: "Transcripcion local",
          transcript: liveDraft,
          summary:
            "Transcripcion capturada localmente. No se genero resumen automatico porque Gemini no esta configurado, no tiene cuota disponible o devolvio un error.",
        });
      }
    }

    // Default MIME type if not provided
    const cleanMimeType = typeof mimeType === "string" ? mimeType.trim().toLowerCase() : "audio/wav";
    if (!ALLOWED_AUDIO_MIME_TYPES.has(cleanMimeType)) {
      return res.status(400).json({ error: "Tipo de audio no permitido." });
    }
    
    // Resolve which API key to use - request's configured key overrides process.env
    // Only use custom client key if it is non-empty and valid
    const resolvedApiKey = await resolveUserGeminiApiKey(req);
    // Create a dynamic client for this request using the resolved key
    const ai = new GoogleGenAI({
      apiKey: resolvedApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const cleanBase64 = cleanBase64Payload(audio, MAX_AUDIO_BASE64_BYTES);

    const systemPrompt = `You are Olli, a precise academic audio transcription system.
Analyze the audio file and generate the response in the language spoken in the audio.
CRITICAL: If the language is Spanish, title, transcript, and summary MUST be entirely in Spanish. Do not translate.

Rules:
1. Produce a literal transcript. Do not summarize inside the transcript.
2. Add chronological timestamps in [MM:SS] format at natural paragraph breaks.
3. Do not invent speaker names or labels. If a word is unclear, write [inaudible].
4. Preserve the meaning of the spoken audio even if the reference draft has mistakes.
5. Summary must be factual, academic, plain text, and based only on the audio. No Markdown, emojis, decorative separators, or invented tasks.
6. Title must be short, factual, and in the spoken language.`;

    let userPrompt = normalizeText(promptOverride, 20_000) || "Transcribe literalmente este audio. Devuelve texto con marcas de tiempo [MM:SS]. No inventes palabras; usa [inaudible] si no se entiende.";
    if (liveDraft.length > 0) {
      userPrompt += `

Reference local draft, only as weak context. It may contain errors:
"""
${liveDraft}
"""
Use the audio as the source of truth. Correct the draft only when the audio supports it.`;
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: cleanMimeType,
              data: cleanBase64,
            },
          },
          {
            text: userPrompt,
          },
        ],
      },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: {
              type: Type.STRING,
              description: "Snappy, clean meeting title, e.g., 'Weekly Standup & Milestone Planning'.",
            },
            transcript: {
              type: Type.STRING,
              description: "Full, precise, literal transcript of the audio, formatted with chronological [MM:SS] timestamps. Do not invent speaker labels.",
            },
            summary: {
              type: Type.STRING,
              description: "Factual professional plain-text academic summary. Use only evidence from the audio, with no Markdown or emojis.",
            },
          },
          required: ["title", "transcript", "summary"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No transcription text returned from the Gemini model.");
    }

    const result = JSON.parse(response.text);
    return res.json(result);

  } catch (error: any) {
    console.error("Transcribe API Error Details:", error);
    return res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : toFriendlyGeminiError(error) || "No se pudo transcribir el audio. Verifica tu API key de Gemini en Settings.",
    });
  }
});

// Summarize a transcript only after an explicit user action.
app.post("/api/summarize-text", requireLocalUser, aiRateLimit, async (req, res): Promise<any> => {
  try {
    const transcript = normalizeText(req.body?.transcript, MAX_AI_TEXT_CHARS);
    if (!transcript) {
      return res.status(400).json({ error: "No se proporciono texto de transcripcion para resumir." });
    }

    const resolvedApiKey = await resolveUserGeminiApiKey(req);
    const ai = new GoogleGenAI({
      apiKey: resolvedApiKey,
      httpOptions: { headers: { "User-Agent": "aistudio-build" } },
    });

    const systemPrompt = `You are Olli, an academic meeting analysis assistant.
Analyze only the supplied transcript. Reply in the same language as the transcript, defaulting to Spanish.
Do not invent facts, speakers, owners, dates, tasks, conclusions, or terminology.
Return a concise title and a structured analysis.

Rules for the analysis:
- overview: one or two factual paragraphs for a student.
- keyPoints: 3 to 8 concrete concepts, claims, or explanations from the transcript.
- actionItems: include only explicitly stated tasks, commitments, or follow-ups. Return an empty array when there are none.
- outline: group the real topics into short headings with supporting points. Do not repeat the full transcript.
- additionalNotes: include only useful clarifications, uncertainties, or study notes grounded in the transcript. Return an empty array when none apply.
- Do not use Markdown, emojis, decorative separators, or speaker labels that are not present in the source.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Analiza la siguiente transcripcion y devuelve el JSON solicitado:\n\n${transcript}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "Short factual title in the transcript language." },
            analysis: {
              type: Type.OBJECT,
              properties: {
                overview: { type: Type.STRING },
                keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
                actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
                outline: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      heading: { type: Type.STRING },
                      items: { type: Type.ARRAY, items: { type: Type.STRING } },
                    },
                    required: ["heading", "items"],
                  },
                },
                additionalNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["overview", "keyPoints", "actionItems", "outline", "additionalNotes"],
            },
          },
          required: ["title", "analysis"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No summary text returned from the Gemini model.");
    }

    const result = JSON.parse(response.text);
    const analysis = normalizeGeneratedAnalysis(result.analysis);
    return res.json({
      title: normalizeText(result.title, 160) || "Sesion sin titulo",
      transcript,
      summary: analysis.overview,
      analysis,
    });
  } catch (error: any) {
    console.error("Summarize-Text API Error:", error);
    return res.status(500).json({
      error: toFriendlyGeminiError(error) || "No se pudo resumir la transcripcion.",
    });
  }
});
// Interactive AI Chat Assistant for meeting notes answering questions about transcript
app.post("/api/chat", requireLocalUser, aiRateLimit, async (req, res): Promise<any> => {
  try {
    const transcript = normalizeText(req.body?.transcript, MAX_AI_TEXT_CHARS);
    const userMessage = normalizeText(req.body?.userMessage, 4_000);
    const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    if (!transcript) {
      return res.status(400).json({ error: "No se proporcionó contexto de transcripción para chatear." });
    }
    if (!userMessage) {
      return res.status(400).json({ error: "No se proporcionó un mensaje del usuario." });
    }

    const resolvedApiKey = await resolveUserGeminiApiKey(req);
    const ai = new GoogleGenAI({
      apiKey: resolvedApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemPrompt = `You are Olli, the elite AI meeting assistant inside an Otter.ai-like workspace.
You have full access to the verbatim meeting transcript of the current session.
Answer the user's questions about the meeting accurately, detailing speaker inputs, decisions, action items, or direct quotes when requested.
Maintain a helpful, friendly, natural, and precise professional tone.
CRITICAL: Speak in the same language as the user's message (default to Spanish if the query is in Spanish or if the meeting transcript is in Spanish).
Do not fabricate information. If the requested details cannot be found or reasonable inferred from the transcript, politely state that.

Verbatim Meeting Transcript:
"""
${transcript}
"""`;

    const geminiContents = [];
    const safeMessages = rawMessages
      .slice(-MAX_CHAT_HISTORY_MESSAGES)
      .map((msg) => ({
        role: msg?.role === "user" ? "user" : "model",
        content: normalizeText(msg?.content, 4_000),
      }))
      .filter((msg) => msg.content);

    if (safeMessages.length > 0) {
      for (const msg of safeMessages) {
        geminiContents.push({
          role: msg.role,
          parts: [{ text: msg.content }]
        });
      }
    }
    geminiContents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: geminiContents,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    return res.json({
      response: response.text || "No se ha podido generar una respuesta."
    });

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return res.status(500).json({
      error: toFriendlyGeminiError(error) || "No se pudo responder con Olli AI."
    });
  }
});

// Enviar reporte PDF y minuta por correo electrónico
app.post("/api/send-email", requireLocalUser, emailRateLimit, async (req, res): Promise<any> => {
  try {
    validateJsonPayloadSize(req, 12 * 1024 * 1024);
    const { to, subject, body, pdfBase64, pdfFilename, title } = req.body;

    if (!isValidEmail(to)) {
      return res.status(400).json({ error: "Falta el destinatario (correo electrónico)" });
    }

    const useSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

    if (!useSmtp) {
      return res.status(503).json({
        code: "SMTP_NOT_CONFIGURED",
        error: "Olli no tiene SMTP configurado. Se descargara el PDF y se abrira un borrador de correo para adjuntarlo manualmente.",
      });
    }

    const senderAddress = process.env.SMTP_FROM || "no-reply@olli.local";
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_PORT === "465",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const meetingTitle = normalizeText(title, 160) || "Reunion de Olli";
    const safeBody = normalizeText(body, 2_000);
    const safeSubject = normalizeText(subject, 180) || `Resumen y Acta de Reunion: ${meetingTitle}`;
    const safePdfFilename = normalizeText(pdfFilename, 160).replace(/[\\/:*?"<>|]+/g, "-") || "reunion.pdf";
    const safeHtmlBody = safeBody.replace(/[<>&]/g, "").replace(/\n/g, "<br/>");
    const mailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      attachments: any[];
    } = {
      from: senderAddress,
      to: to.trim(),
      subject: safeSubject,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
          <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
            <h1 style="color: #0f172a; margin: 8px 0 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">Olli</h1>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Actas de reunion y transcripcion inteligente</p>
          </div>
          
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">¡Hola!</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Te han enviado el reporte PDF, la transcripción y el resumen inteligente de la sesión titulada <strong>"${meetingTitle}"</strong>. Puedes encontrar el archivo PDF oficial adjunto en este correo.
          </p>
          
          <div style="background-color: #f8fafc; padding: 18px; border-radius: 12px; border: 1px solid #f1f5f9; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.05em;">Notas u observaciones de quien envía:</p>
            <p style="margin: 0; font-size: 14px; color: #0f172a; font-style: italic; line-height: 1.5;">
              "${safeHtmlBody || 'No se incluyeron notas adicionales.'}"
            </p>
          </div>
          
          <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px; text-align: center;">
            <p style="font-size: 13px; color: #64748b; margin: 0 0 4px 0;">¿Deseas procesar más reuniones de hasta 3 horas sin límites de tamaño?</p>
            <p style="font-size: 13px; color: #0f172a; font-weight: 600; margin: 0;">Ejecuta Olli localmente o en tu propio servidor.</p>
          </div>
          
          <footer style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
            Enviado desde Olli local.<br/>
            Para usar un servidor de correo corporativo real, configura tus variables SMTP en la configuración de entorno o de AI Studio secrets.
          </footer>
        </div>
      `,
      text: `Olli Report: ${meetingTitle}\n\nAqui tienes el resumen y transcripcion de la reunion adjunta en PDF.\n\nObservaciones enviadas:\n"${safeBody || 'N/A'}"\n\nEnviado desde Olli local.`,
      attachments: [],
    };

    if (pdfBase64) {
      const cleanBase64 = cleanBase64Payload(pdfBase64, MAX_PDF_BASE64_BYTES);
      
      mailOptions.attachments.push({
        filename: safePdfFilename.endsWith(".pdf") ? safePdfFilename : `${safePdfFilename}.pdf`,
        content: cleanBase64,
        encoding: "base64",
        contentType: "application/pdf"
      });
    }

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully. Message ID:", info.messageId);

    return res.json({
      success: true,
      messageId: info.messageId,
      message: "El correo fue enviado con el PDF adjunto usando tu SMTP configurado."
    });

  } catch (error: any) {
    console.error("Email Dispatcher API Error:", error);
    return res.status(error.status || 500).json({
      error: error.status
        ? error.message
        : safeErrorMessage(error, "No se pudo procesar y despachar el correo electronico.")
    });
  }
});


// Custom Express global error handler middleware to prevent plain HTML crashes and ensure tidy JSON error formats
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Handled Express Error:", err);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: status === 413
      ? "La peticion es demasiado grande."
      : safeErrorMessage(err, "Olli encontro un error inesperado en el servidor."),
  });
});

// Configure Vite middleware or static serving
async function configureServer() {
  if (process.env.VERCEL) {
    console.log("Running in Vercel context. Skipping Vite/static configurations as routing is managed by Vercel edge/rewrites.");
    return;
  }

  const distPath = path.join(process.cwd(), "dist");
  const isProduction = process.env.NODE_ENV === "production" || fs.existsSync(distPath);

  if (!isProduction) {
    // Development mode
    console.log("Configuring development mode with active Vite routing...");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares as any);
  } else {
    // Production static serving
    console.log("Configuring production mode with static direct dist routing...");
    app.use(express.static(distPath) as any);
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Olli Server fully operational at http://localhost:${PORT}`);
  });
}

configureServer().catch((err) => {
  console.error("Failed to start server entrypoint:", err);
});

export default app;


