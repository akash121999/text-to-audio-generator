/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { 
  Play, 
  Pause, 
  Square, 
  Download, 
  Trash2, 
  Volume2, 
  Settings2, 
  Mic2,
  RefreshCw,
  Loader2,
  History,
  Info,
  AlertTriangle,
  ExternalLink
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
type Voice = { 
  id: string; 
  name: string; 
  gender: "Male" | "Female"; 
  accent: string; 
  provider: "gemini";
  sampleText?: string;
};
type Style = "normal" | "storytelling" | "news" | "energetic";

const VOICES: Voice[] = [
  { id: "Kore", name: "Kore", gender: "Female", accent: "Balanced", provider: "gemini", sampleText: "Hello, I am Kore. I can help you read your stories with a soft and clear touch." },
  { id: "Puck", name: "Puck", gender: "Male", accent: "Deep", provider: "gemini", sampleText: "Greetings, I am Puck. My voice is deep and resonant, perfect for formal announcements." },
  { id: "Charon", name: "Charon", gender: "Male", accent: "Neutral", provider: "gemini", sampleText: "Hi, I am Charon. I provide a balanced and neutral tone for any kind of content." },
  { id: "Zephyr", name: "Zephyr", gender: "Female", accent: "Breezy", provider: "gemini", sampleText: "Hey there, I am Zephyr. My voice is light and energetic, great for keeping things moving." },
  { id: "Fenrir", name: "Fenrir", gender: "Male", accent: "Strong", provider: "gemini", sampleText: "I am Fenrir. My voice is strong and clear, designed for impactful narration." },
];

const STYLES: { id: Style; label: string; description: string }[] = [
  { id: "normal", label: "Normal", description: "Standard clear speech" },
  { id: "storytelling", label: "Storytelling", description: "Engaging & expressive" },
  { id: "news", label: "News", description: "Formal & authoritative" },
  { id: "energetic", label: "Energetic", description: "Vibrant & fast-paced" },
];

export default function App() {
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0]);
  const [selectedVoice2, setSelectedVoice2] = useState(VOICES[1]);
  const [isMultiSpeaker, setIsMultiSpeaker] = useState(false);
  const [selectedStyle, setSelectedStyle] = useState<Style>("normal");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isPlayingSample, setIsPlayingSample] = useState<string | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const maxChars = 2000;

  const handlePlaySample = async (voice: Voice) => {
    if (isPlayingSample === voice.id) {
      if (sampleAudioRef.current) {
        sampleAudioRef.current.pause();
        setIsPlayingSample(null);
      }
      return;
    }

    setIsPlayingSample(voice.id);
    setError(null);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: voice.sampleText || "This is a sample.",
          voice: voice.id,
          provider: "gemini"
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (sampleAudioRef.current) {
        sampleAudioRef.current.src = data.url;
        sampleAudioRef.current.play();
      }
    } catch (err: any) {
      setError({ message: `Sample failed: ${err.message}` });
      setIsPlayingSample(null);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim()) {
      setError({ message: "Please enter some text to convert." });
      return;
    }
    
    setIsGenerating(true);
    setError(null);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voice: selectedVoice.id,
          voice2: selectedVoice2.id,
          style: selectedStyle,
          provider: "gemini",
          isMultiSpeaker
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw { message: data.error, code: data.code };
      }

      setAudioUrl(data.url);
      // Force reload
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
        }
      }, 0);
      setIsPlaying(false);
    } catch (err: any) {
      setError({ 
        message: err.message, 
        code: err.code || (err.message?.includes("401") ? "AUTH_ERROR" : undefined)
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const togglePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const link = document.createElement("a");
    link.href = audioUrl;
    link.download = `voxgen-${selectedVoice.name}-${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#1A1A1A] font-sans">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#1A1A1A] rounded-xl flex items-center justify-center shadow-lg">
              <Volume2 className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-black">VoxGen</h1>
              <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Active Hybrid Mode</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1 bg-green-50 text-green-600 rounded-full border border-green-100 text-[10px] font-bold uppercase tracking-wider">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            Gemini Core Active
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm flex flex-col h-[520px]">
              <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/30">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
                  <Mic2 className="w-4 h-4" />
                  Script Editor
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => {
                      setIsMultiSpeaker(true);
                      setText("Speaker 1: Hello, how are you today?\nSpeaker 2: I'm doing great, thank you for asking!");
                    }}
                    className="text-[10px] text-black hover:underline font-bold"
                  >
                    Try Dialogue Ex.
                  </button>
                  <div className="text-[10px] font-mono text-gray-400">
                    {text.length} / {maxChars}
                  </div>
                </div>
              </div>
              
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={isMultiSpeaker 
                  ? "Speaker 1: [Text]\nSpeaker 2: [Text]" 
                  : "Type your script here... Use Gemini voices for instant generation."}
                className="flex-1 w-full p-8 resize-none focus:outline-none text-lg text-gray-700 leading-relaxed font-sans"
              />
              
              <div className="p-6 bg-white border-t border-gray-50 flex items-center justify-between">
                <button onClick={() => setText("")} className="text-gray-400 hover:text-gray-600 flex items-center gap-2 text-sm">
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
                
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating || !text.trim()}
                  className="bg-[#1A1A1A] text-white px-10 py-4 rounded-2xl font-bold flex items-center gap-3 hover:bg-black transition-all active:scale-95 disabled:opacity-50"
                >
                  {isGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <RefreshCw className="w-5 h-5" />}
                  Generate Speech
                </button>
              </div>
            </div>

            <audio ref={sampleAudioRef} className="hidden" onEnded={() => setIsPlayingSample(null)} />

            <AnimatePresence>
              {audioUrl && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-[#1A1A1A] p-6 rounded-3xl shadow-xl flex items-center gap-6">
                  <button onClick={togglePlayPause} className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center hover:scale-105 transition-all">
                    {isPlaying ? <Pause className="w-6 h-6 fill-current" /> : <Play className="w-6 h-6 fill-current" />}
                  </button>
                  <div className="flex-1 space-y-2">
                    <div className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Audio Sync Ready</div>
                    <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                      <motion.div className="h-full bg-white w-1/4" animate={{ x: isPlaying ? ["-100%", "400%"] : "0%" }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={handleStop} className="p-2 text-gray-500 hover:text-white"><Square className="w-5 h-5 fill-current" /></button>
                    <button onClick={handleDownload} className="bg-gray-800 p-3 rounded-xl text-white hover:bg-gray-700"><Download className="w-5 h-5" /></button>
                  </div>
                  <audio 
                    ref={audioRef} 
                    src={audioUrl || ""} 
                    onEnded={() => setIsPlaying(false)} 
                    onPlay={() => setIsPlaying(true)}
                    onPause={() => setIsPlaying(false)}
                    onError={(e) => {
                      const target = e.target as HTMLAudioElement;
                      console.error("Audio playback error detected:", target.currentSrc);
                      if (target.error) {
                        setError({ message: `Playback failed: ${target.error.message || "File not found or format not supported (Code: " + target.error.code + ")"}` });
                      }
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {error && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 bg-red-50 border border-red-100 rounded-3xl space-y-3">
                <div className="flex items-center gap-3 text-red-600 font-bold">
                  <AlertTriangle className="w-5 h-5" />
                  Generation Error
                </div>
                <p className="text-sm text-red-500 leading-relaxed">{error.message}</p>
              </motion.div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm space-y-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Speaker Configuration</label>
                  <label className="flex items-center gap-2 cursor-pointer group">
                    <span className="text-[10px] font-bold text-gray-500">Multi-Speaker</span>
                    <div 
                      onClick={() => setIsMultiSpeaker(!isMultiSpeaker)}
                      className={`w-8 h-4 rounded-full transition-colors relative ${isMultiSpeaker ? "bg-black" : "bg-gray-200"}`}
                    >
                      <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${isMultiSpeaker ? "left-4.5" : "left-0.5"}`} />
                    </div>
                  </label>
                </div>

                <div className="space-y-6">
                  {/* Speaker 1 Selection */}
                  <div className="space-y-3">
                    <span className="text-[10px] text-gray-400 font-mono italic">
                      {isMultiSpeaker ? "Speaker 1 Voice" : "Primary Voice"}
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      {VOICES.map((v) => (
                        <div key={`s1-${v.id}`} className="relative group">
                          <button
                            onClick={() => setSelectedVoice(v)}
                            className={`w-full p-4 rounded-2xl border text-left transition-all pr-12 ${
                              selectedVoice.id === v.id ? "border-black bg-gray-50 ring-2 ring-black/5" : "border-gray-100 hover:border-gray-200"
                            }`}
                          >
                            <div className="font-bold text-[11px] truncate">{v.name}</div>
                            <div className="text-[9px] opacity-40 uppercase font-mono">{v.gender} • {v.accent}</div>
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handlePlaySample(v); }}
                            className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${isPlayingSample === v.id ? "bg-black text-white" : "text-gray-400 hover:bg-gray-100"}`}
                          >
                            {isPlayingSample === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Speaker 2 Selection (Only if multi-speaker active) */}
                  <AnimatePresence>
                    {isMultiSpeaker && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }} 
                        animate={{ opacity: 1, height: "auto" }} 
                        exit={{ opacity: 0, height: 0 }} 
                        className="space-y-3 pt-4 border-t border-gray-50 overflow-hidden"
                      >
                        <span className="text-[10px] text-gray-400 font-mono italic">Speaker 2 Voice</span>
                        <div className="grid grid-cols-2 gap-3">
                          {VOICES.map((v) => (
                            <div key={`s2-${v.id}`} className="relative group">
                              <button
                                onClick={() => setSelectedVoice2(v)}
                                className={`w-full p-4 rounded-2xl border text-left transition-all pr-12 ${
                                  selectedVoice2.id === v.id ? "border-black bg-gray-50 ring-2 ring-black/5" : "border-gray-100 hover:border-gray-200"
                                }`}
                              >
                                <div className="font-bold text-[11px] truncate">{v.name}</div>
                                <div className="text-[9px] opacity-40 uppercase font-mono">{v.gender} • {v.accent}</div>
                              </button>
                              <button 
                                onClick={(e) => { e.stopPropagation(); handlePlaySample(v); }}
                                className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${isPlayingSample === v.id ? "bg-black text-white" : "text-gray-400 hover:bg-gray-100"}`}
                              >
                                {isPlayingSample === v.id ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-current" />}
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Emotional Style</label>
                <div className="space-y-2">
                  {STYLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStyle(s.id)}
                      className={`w-full p-4 rounded-xl border flex flex-col text-left transition-all ${
                        selectedStyle === s.id ? "border-black bg-black text-white" : "border-gray-100 hover:border-gray-200"
                      }`}
                    >
                      <span className="font-bold text-xs">{s.label}</span>
                      <span className="text-[10px] opacity-60">{s.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="p-6 bg-gray-50 rounded-3xl border border-gray-100 text-xs text-gray-400 leading-relaxed flex flex-col gap-3">
              <div className="flex items-center gap-2 font-bold text-gray-500 uppercase tracking-tighter">
                <Info className="w-3 h-3" /> Quick Insight
              </div>
              <p>Gemini voices are powered by Google's native AI models. They support multi-speaker dialogues and multiple emotional styles out of the box.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


