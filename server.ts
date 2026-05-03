import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import crypto from "crypto";

import { GoogleGenAI, Modality } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Ensure temp audio directory exists
  const tempDir = path.join(process.cwd(), 'public', 'audio');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Helper to wrap PCM in WAV
  function pcmToWavBuffer(base64Data: string, sampleRate = 24000): Buffer {
    const binaryString = Buffer.from(base64Data, 'base64');
    const len = binaryString.length;
    const wavHeader = Buffer.alloc(44);
    
    wavHeader.write("RIFF", 0);
    wavHeader.writeUInt32LE(36 + len, 4);
    wavHeader.write("WAVE", 8);
    wavHeader.write("fmt ", 12);
    wavHeader.writeUInt32LE(16, 16);
    wavHeader.writeUInt16LE(1, 20);
    wavHeader.writeUInt16LE(1, 22);
    wavHeader.writeUInt32LE(sampleRate, 24);
    wavHeader.writeUInt32LE(sampleRate * 2, 28);
    wavHeader.writeUInt16LE(2, 32);
    wavHeader.writeUInt16LE(16, 34);
    wavHeader.write("data", 36);
    wavHeader.writeUInt32LE(len, 40);

    return Buffer.concat([wavHeader, binaryString]);
  }

  // Log all requests for debugging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Routes MUST be registered before any fallback/Vite middleware
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      env: process.env.NODE_ENV,
      time: new Date().toISOString()
    });
  });

  app.post("/api/tts", async (req, res) => {
    console.log("Processing TTS request:", {
      text: req.body.text?.substring(0, 50) + "...",
      voice: req.body.voice,
      provider: req.body.provider
    });

    try {
      const { text, voice, style, provider, isMultiSpeaker, voice2 } = req.body;

      if (!text || text.length > 2000) {
        return res.status(400).json({ error: "Text is required and must be under 2000 characters." });
      }

      // Use a consistent temp directory that works in both dev and prod
      // We'll use process.cwd() + 'public/audio' which is served by express.static
      const hashData = `${text}-${voice}-${voice2 || ""}-${style}-${provider}-${isMultiSpeaker}`;
      const hash = crypto.createHash('md5').update(hashData).digest('hex');
      const fileName = `${hash}.wav`;
      const filePath = path.join(tempDir, fileName);
      const publicPath = `/audio/${fileName}`;

      if (fs.existsSync(filePath)) {
        return res.json({ url: publicPath });
      }

      const key = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "").replace(/["']/g, "").trim();
      
      if (!key || key === "MY_GEMINI_API_KEY") {
        return res.status(401).json({ 
          error: "Gemini API key is missing. Please add 'GEMINI_API_KEY' to your Secrets.",
          code: "MISSING_KEY"
        });
      }

      const ai = new GoogleGenAI({ apiKey: key });
      let prompt = text;
      if (!isMultiSpeaker && style && style !== "normal") {
        prompt = `Tone: ${style}. Text: ${text}`;
      }

      const config: any = {
        responseModalities: [Modality.AUDIO],
      };

      if (isMultiSpeaker) {
        config.speechConfig = {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: 'Speaker 1', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice || 'Kore' } } },
              { speaker: 'Speaker 2', voiceConfig: { prebuiltVoiceConfig: { voiceName: voice2 || 'Puck' } } }
            ]
          }
        };
      } else {
        config.speechConfig = {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice || "Kore" },
          },
        };
      }

      // Try the modern TTS preview model first, fallback to flash if needed
      let response;
      try {
        response = await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config
        });
      } catch (e) {
        console.warn("TTS preview model failed, falling back to flash-latest", e);
        response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: [{ parts: [{ text: prompt }] }],
          config
        });
      }

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Audio) {
        throw new Error("No audio data returned from Gemini");
      }

      const wavBuffer = pcmToWavBuffer(base64Audio);
      await fs.promises.writeFile(filePath, wavBuffer);
      return res.json({ url: publicPath });

    } catch (error: any) {
      console.error("TTS Route Error:", error);
      res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Static files from public (accessible in both dev and prod)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Vite or Production Fallback
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
