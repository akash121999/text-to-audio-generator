import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import OpenAI from "openai";
import crypto from "crypto";

import { GoogleGenAI, Modality } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // Correct initialization
  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

  // Ensure temp audio directory exists
  const tempDir = path.join(process.cwd(), 'public', 'audio');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Serve static files from public directory (for the generated audio)
  app.use(express.static(path.join(process.cwd(), 'public')));

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

  // API Routes
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voice, speed, pitch, style, provider, isMultiSpeaker, voice2 } = req.body;

      if (!text || text.length > 2000) {
        return res.status(400).json({ error: "Text is required and must be under 2000 characters." });
      }

      // Generate a unique hash for caching
      const hashData = `${text}-${voice}-${voice2 || ""}-${speed}-${pitch}-${style}-${provider}-${isMultiSpeaker}`;
      const hash = crypto.createHash('md5').update(hashData).digest('hex');
      const fileName = `${hash}.wav`;
      const filePath = path.join(tempDir, fileName);
      const publicPath = `/audio/${fileName}`;

      // Check cache
      if (fs.existsSync(filePath)) {
        return res.json({ url: publicPath });
      }

      if (provider === "gemini") {
        let prompt = text;
        if (!isMultiSpeaker && style && style !== "normal") {
          prompt = `Say ${style === "news" ? "professionally" : style} tone: ${text}`;
        }

        const config: any = {
          responseModalities: [Modality.AUDIO],
        };

        if (isMultiSpeaker) {
          config.speechConfig = {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                {
                  speaker: 'Speaker 1',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
                },
                {
                  speaker: 'Speaker 2',
                  voiceConfig: { prebuiltVoiceConfig: { voiceName: voice2 } }
                }
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

        const response = await genAI.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text: prompt }] }],
          config
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (!base64Audio) {
          throw new Error("Gemini failed to return audio data.");
        }

        const wavBuffer = pcmToWavBuffer(base64Audio);
        await fs.promises.writeFile(filePath, wavBuffer);
        return res.json({ url: publicPath });

      } else {
        // OpenAI TTS Logic
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
          return res.status(400).json({ 
            error: "OPENAI_API_KEY is missing. Please add it to 'Secrets' in the sidebar.",
            code: "MISSING_KEY"
          });
        }

        const openai = new OpenAI({ apiKey });
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: voice || "alloy",
          input: text,
          speed: parseFloat(speed) || 1.0,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        // For OpenAI we use .wav extension in cache for simplicity or change it to .mp3
        const mp3FileName = `${hash}.mp3`;
        const mp3FilePath = path.join(tempDir, mp3FileName);
        await fs.promises.writeFile(mp3FilePath, buffer);
        return res.json({ url: `/audio/${mp3FileName}` });
      }
    } catch (error: any) {
      console.error("TTS Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate speech" });
    }
  });

  // Vite middleware for development
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
