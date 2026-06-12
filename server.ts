import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

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
    const { audio, mimeType, aiProvider, promptOverride, apiKey } = req.body;

    if (!audio) {
      return res.status(400).json({ error: "Missing audio data in base64 format." });
    }

    // Default MIME type if not provided
    const cleanMimeType = mimeType || "audio/wav";
    
    // Resolve which API key to use - request's configured key overrides process.env
    const resolvedApiKey = apiKey || process.env.GEMINI_API_KEY;
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
Analyze the audio file provided and generate:
1. Exact verbatim transcript. Ensure everything spoken is captured without paraphrasing.
2. Obsidian-style summary featuring chapters with duration timestamps, clean outlines, and bulleted checklist tasks like [ ] or [x] for clear action items.
3. A short, creative title summarizing the conversation.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: cleanBase64,
          },
        },
        {
          text: promptOverride || "Perform a precise transcription of this audio, and present structural meeting notes.",
        },
      ],
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
              description: "Full, precise, verbatim transcript of everything spoken in the audio.",
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
    console.error("Transcribe API Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to transcribe audio. Please verify your GEMINI_API_KEY is configured in Settings > Secrets.",
    });
  }
});

// Configure Vite middleware or static serving
async function configureServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development mode
    console.log("Configuring development mode with active Vite routing...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production static serving
    console.log("Configuring production mode with static direct dist routing...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MeetingBrain Server fully operational at http://localhost:${PORT}`);
  });
}

configureServer().catch((err) => {
  console.error("Failed to start server entrypoint:", err);
});
