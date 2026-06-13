import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import nodemailer from "nodemailer";

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

// Summarize a text transcript (lightweight and robust to bypass Vercel timeout errors)
app.post("/api/summarize-text", async (req, res): Promise<any> => {
  try {
    const { transcript, apiKey } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "No se proporcionó texto de transcripción para resumir." });
    }

    // Resolve which API key to use
    const isCustomKeyValid = apiKey && apiKey.trim().startsWith("AIzaSy");
    const resolvedApiKey = isCustomKeyValid ? apiKey.trim() : process.env.GEMINI_API_KEY;
    if (!resolvedApiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please verify it is set in Workspace Settings or in your environment secrets.");
    }

    const ai = new GoogleGenAI({
      apiKey: resolvedApiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemPrompt = `You are MeetingBrain, an elite AI tool designed to summarize meeting transcriptions and output gorgeous Notion & Obsidian styled summaries.
Analyze the transcript provided and generate the response in the same language.
CRITICAL: If the input text is in Spanish, the 'title' and 'summary' MUST be generated entirely in Spanish. Default to Spanish when in doubt.

Specifically, generate:
1. Obsidian-style summary, featuring chapters, outlines, clean bullet points, and checkbox checklists like [ ] or [x] for clear action items.
2. A short, creative title summarizing the conversation.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          {
            text: `Por favor resume la siguiente transcripción en español:\n\n${transcript}`,
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
              description: "Snappy, clean meeting title in Spanish.",
            },
            summary: {
              type: Type.STRING,
              description: "Fully styled Markdown summary in Spanish with headings, key insights, milestones, bulleted points, and checklist items.",
            },
          },
          required: ["title", "summary"],
        },
      },
    });

    if (!response.text) {
      throw new Error("No summary text returned from the Gemini model.");
    }

    const result = JSON.parse(response.text);
    return res.json({
      title: result.title,
      transcript: transcript,
      summary: result.summary,
    });

  } catch (error: any) {
    console.error("Summarize-Text API Error:", error);
    return res.status(500).json({
      error: error.message || "Failed to summarize text transcript.",
    });
  }
});

// Interactive AI Chat Assistant for meeting notes answering questions about transcript
app.post("/api/chat", async (req, res): Promise<any> => {
  try {
    const { transcript, messages, userMessage, apiKey } = req.body;

    if (!transcript) {
      return res.status(400).json({ error: "No se proporcionó contexto de transcripción para chatear." });
    }
    if (!userMessage) {
      return res.status(400).json({ error: "No se proporcionó un mensaje del usuario." });
    }

    const isCustomKeyValid = apiKey && apiKey.trim().startsWith("AIzaSy");
    const resolvedApiKey = isCustomKeyValid ? apiKey.trim() : process.env.GEMINI_API_KEY;
    if (!resolvedApiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please verify it is set in Workspace Settings or in your environment secrets.");
    }

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
    if (messages && messages.length > 0) {
      for (const msg of messages) {
        geminiContents.push({
          role: msg.role === "user" ? "user" : "model",
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
      error: error.message || "Failed to interact with the AI assistant."
    });
  }
});

// Enviar reporte PDF y minuta por correo electrónico
app.post("/api/send-email", async (req, res): Promise<any> => {
  try {
    const { to, subject, body, pdfBase64, pdfFilename, title } = req.body;

    if (!to) {
      return res.status(400).json({ error: "Falta el destinatario (correo electrónico)" });
    }

    // Determine if custom SMTP is configured
    const useSmtp = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
    
    let transporter;
    let senderAddress = process.env.SMTP_FROM || "no-reply@meetingbrain.local";
    let isTestAccount = false;
    let testMessageBoxUrl = "";

    if (useSmtp) {
      // Use custom SMTP configured
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || "587"),
        secure: process.env.SMTP_PORT === "465",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // Fallback: Dynamically generate a temporary Ethereal test SMTP account (brilliant for preview/sandbox checks)
      console.log("No SMTP settings in .env/secrets. Creating automatic temporary Ethereal SMTP account for live preview/logs...");
      isTestAccount = true;
      const testAccount = await nodemailer.createTestAccount();
      
      transporter = nodemailer.createTransport({
        host: testAccount.smtp.host,
        port: testAccount.smtp.port,
        secure: testAccount.smtp.secure,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
      senderAddress = `"MeetingBrain Local Preview" <${testAccount.user}>`;
    }

    const meetingTitle = title || "Reunión de MeetingBrain";
    const mailOptions: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text: string;
      attachments: any[];
    } = {
      from: senderAddress,
      to,
      subject: subject || `Resumen y Acta de Reunión: ${meetingTitle}`,
      html: `
        <div style="font-family: system-ui, -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #f1f5f9; border-radius: 16px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);">
          <div style="text-align: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 20px; margin-bottom: 24px;">
            <span style="font-size: 28px;">🧠</span>
            <h1 style="color: #0f172a; margin: 8px 0 0 0; font-size: 22px; font-weight: 800; letter-spacing: -0.025em;">MeetingBrain</h1>
            <p style="color: #64748b; margin: 4px 0 0 0; font-size: 14px;">Actas de Reunión & Transcripción de Audio Inteligente</p>
          </div>
          
          <p style="font-size: 15px; color: #334155; line-height: 1.6; margin-top: 0;">¡Hola!</p>
          <p style="font-size: 15px; color: #334155; line-height: 1.6;">
            Te han enviado el reporte PDF, la transcripción y el resumen inteligente de la sesión titulada <strong>"${meetingTitle}"</strong>. Puedes encontrar el archivo PDF oficial adjunto en este correo.
          </p>
          
          <div style="background-color: #f8fafc; padding: 18px; border-radius: 12px; border: 1px solid #f1f5f9; margin: 24px 0;">
            <p style="margin: 0 0 8px 0; font-size: 11px; text-transform: uppercase; font-weight: 800; color: #64748b; letter-spacing: 0.05em;">Notas u observaciones de quien envía:</p>
            <p style="margin: 0; font-size: 14px; color: #0f172a; font-style: italic; line-height: 1.5;">
              "${body ? body.replace(/\ng/, '<br/>') : 'No se incluyeron notas adicionales.'}"
            </p>
          </div>
          
          <div style="border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 24px; text-align: center;">
            <p style="font-size: 13px; color: #64748b; margin: 0 0 4px 0;">¿Deseas procesar más reuniones de hasta 3 horas sin límites de tamaño?</p>
            <p style="font-size: 13px; color: #0f172a; font-weight: 600; margin: 0;">Ejecuta MeetingBrain localmente o en tu propio servidor VPS/Cloud Run.</p>
          </div>
          
          <footer style="margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 16px; text-align: center; font-size: 11px; color: #94a3b8; line-height: 1.5;">
            Enviado de forma segura de forma automática a través de MeetingBrain.<br/>
            Para usar un servidor de correo corporativo real, configura tus variables SMTP en la configuración de entorno o de AI Studio secrets.
          </footer>
        </div>
      `,
      text: `MeetingBrain Report: ${meetingTitle}\n\nAquí tienes el resumen y transcripción de la reunión adjunta en PDF.\n\nObservaciones enviadas:\n"${body || 'N/A'}"\n\nEnviado de forma segura desde tu portal de minutos MeetingBrain.`,
      attachments: [],
    };

    if (pdfBase64) {
      let cleanBase64 = pdfBase64;
      if (pdfBase64.includes(";base64,")) {
        cleanBase64 = pdfBase64.split(";base64,")[1];
      }
      
      mailOptions.attachments.push({
        filename: pdfFilename || "reunion.pdf",
        content: cleanBase64,
        encoding: "base64",
        contentType: "application/pdf"
      });
    }

    // Send the email
    const info = await transporter.sendMail(mailOptions);
    console.log("Email sent successfully. Message ID:", info.messageId);

    if (isTestAccount) {
      testMessageBoxUrl = nodemailer.getTestMessageUrl(info) || "";
      console.log("Test inbox viewing link available at:", testMessageBoxUrl);
    }

    return res.json({
      success: true,
      messageId: info.messageId,
      isTestAccount,
      testMessageBoxUrl,
      message: isTestAccount 
        ? "El correo se envió con éxito usando un servidor de pruebas temporal (Ethereal). Puedes acceder a la bandeja para ver el PDF adjunto y la bandeja de entrada aquí."
        : "El correo electrónico fue despachado exitosamente con el PDF adjunto a través de tu servidor SMTP configurado."
    });

  } catch (error: any) {
    console.error("Email Dispatcher API Error:", error);
    return res.status(500).json({
      error: error.message || "No se pudo procesar y despachar el correo electrónico."
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
    console.log(`MeetingBrain Server fully operational at http://localhost:${PORT}`);
  });
}

configureServer().catch((err) => {
  console.error("Failed to start server entrypoint:", err);
});

export default app;
