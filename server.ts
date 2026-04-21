import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import cors from "cors";
import OpenAI from "openai";
import crypto from "crypto";

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

  // Serve static files from public directory (for the generated audio)
  app.use(express.static(path.join(process.cwd(), 'public')));

  // API Routes
  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voice, speed, pitch, style } = req.body;

      if (!text || text.length > 2000) {
        return res.status(400).json({ error: "Text is required and must be under 2000 characters." });
      }

      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return res.status(400).json({ 
          error: "OPENAI_API_KEY is missing. Please add it to 'Secrets' in the sidebar.",
          code: "MISSING_KEY"
        });
      }

      if (apiKey.startsWith("AIza")) {
        return res.status(400).json({ 
          error: "You provided a Google/Gemini key (starting with 'AIza') in the OPENAI_API_KEY slot. Please provide a valid OpenAI key starting with 'sk-'.",
          code: "KEY_MISMATCH"
        });
      }

      const openai = new OpenAI({ apiKey });

      // Generate a unique hash for caching
      const hash = crypto.createHash('md5').update(`${text}-${voice}-${speed}-${pitch}-${style}`).digest('hex');
      const fileName = `${hash}.mp3`;
      const filePath = path.join(tempDir, fileName);
      const publicPath = `/audio/${fileName}`;

      // Check cache
      if (fs.existsSync(filePath)) {
        return res.json({ url: publicPath });
      }

      // OpenAI TTS supports speeds from 0.25 to 4.0
      // We'll normalize the speed if needed, but let's assume valid range 0.5 to 2.0 as per req.
      
      // Pitch and Style: OpenAI's basic TTS (v1) doesn't have direct pitch/style params, 
      // but we can influence it with "Say this in a [style] tone: [text]" or similar if we wanted.
      // However, for this demo, we'll focus on the core functionality.
      
      const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: voice || "alloy",
        input: text,
        speed: parseFloat(speed) || 1.0,
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      await fs.promises.writeFile(filePath, buffer);

      res.json({ url: publicPath });
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
