import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables (from .env/process.env)
dotenv.config();

const app = express();
const PORT = 3000;

// Set maximum request size to support larger audio file uploads
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

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
  res.json({ status: "ok", message: "MeetingBrain backend is fully operational" });
});

// Transcribe and analyze audio
app.post("/api/transcribe", async (req, res): Promise<any> => {
  try {
    const { audio, mimeType, aiProvider, promptOverride, apiKey, liveDraftText } = req.body;

    if (!audio) {
      return res.status(400).json({ error: "Missing audio data in base64 format." });
    }

    // Default MIME type if not provided
    const cleanMimeType = mimeType || "audio/wav";
    
    // Resolve which API key to use - request's configured key overrides process.env
    // Only use custom client key if it looks like a valid Gemini Key (starts with AIzaSy)
    const isCustomKeyValid = apiKey && apiKey.trim().startsWith("AIzaSy");
    const resolvedApiKey = isCustomKeyValid ? apiKey.trim() : process.env.GEMINI_API_KEY;
    if (!resolvedApiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please verify it is set in Workspace Settings or in your environment secrets.");
    }

    // Create a dynamic client for this request using the resolved key
    const ai = new GoogleGenAI({
      apiKey: resolvedApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    // Clean base64 pattern (remove prefix if present)
    let cleanBase64 = audio;
    if (audio.includes(";base64,")) {
      cleanBase64 = audio.split(";base64,")[1];
    }

    const systemPrompt = `You are MeetingBrain, an elite AI tool designed to transcribe recordings and output gorgeous Notion & Obsidian styled meeting summaries.
Analyze the audio file provided and generate the response in the language spoken in the audio.
CRITICAL: If the language of the audio is Spanish, the 'title', 'transcript', and 'summary' MUST be generated entirely in Spanish. Do NOT translate Spanish speech or summaries into English. Default to Spanish when in doubt.

Specifically, generate:
1. Exact verbatim transcript in the native spoken language. EVERY sentence or speaker change MUST begin with a precise, chronological timestamp indicating exactly when it is spoken in the format '[MM:SS] Speaker: ...' (e.g., "[00:04] Speaker 1: Hola...", "[00:15] Speaker 2: Sí, claro..."). Detail the turns meticulously and timeline everything precisely.
2. Obsidian-style summary in the native spoken language, featuring chapters with duration timestamps, clean outlines, and bulleted checklist tasks like [ ] or [x] for clear action items.
3. A short, creative title in the native spoken language summarizing the conversation.`;

    let userPrompt = promptOverride || "Realiza una transcripción precisa de este audio y presenta notas estructuradas en el mismo idioma en que se habla (por defecto, español si el audio es en español).";
    if (liveDraftText && liveDraftText.trim().length > 0) {
      userPrompt += `\n\nReference Live Speech Draft for context and text correction:\n"""\n${liveDraftText}\n"""\nUse the above draft to correct spelling of names or terms, alignment, and format the official transcription with precise timestamps from the audio file.`;
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
              description: "Full, precise, verbatim transcript of everything spoken in the audio, formatted with detailed chronological [MM:SS] speaker labels.",
            },
            summary: {
              type: Type.STRING,
              description: "Fully styled Markdown summary with headings, key insights, bulleted points, and checklist items.",
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
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio. Please verify your GEMINI_API_KEY is configured in Settings > Secrets.",
    });
  }
});

// Custom Express global error handler middleware to prevent plain HTML crashes and ensure tidy JSON error formats
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Global Handled Express Error:", err);
  res.status(err.status || 500).json({
    error: err.message || "An unexpected server-side error occurred in the MeetingBrain backend.",
  });
});

// Configure Vite middleware or static serving
async function configureServer() {
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

  if (!process.env.VERCEL) {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`MeetingBrain Server fully operational at http://localhost:${PORT}`);
    });
  }
}

configureServer().catch((err) => {
  console.error("Failed to start server entrypoint:", err);
});

export default app;
