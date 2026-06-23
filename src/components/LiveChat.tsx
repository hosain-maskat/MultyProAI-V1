"use client";

import { useState, useRef, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, Monitor, MonitorOff, Radio, X } from "lucide-react";

// ---- PCM helpers ----
function float32ToPCM16Base64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
  return float32;
}

// ---- Main Component ----
export default function LiveChat({ userApiKey, onClose }: { userApiKey?: string; onClose?: () => void }) {
  const [status, setStatus] = useState<"idle" | "connecting" | "ready" | "error">("idle");
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenOn, setIsScreenOn] = useState(false);
  const [voice, setVoice] = useState("Aoede");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusText, setStatusText] = useState("Connect to start");
  const [transcript, setTranscript] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextAudioTime = useRef(0);
  const workletRef = useRef<AudioWorkletNode | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const screenRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const captureCtxRef = useRef<AudioContext | null>(null);

  // ---- Audio Playback ----
  const playAudio = useCallback((b64: string) => {
    if (!audioCtxRef.current) return;
    const ctx = audioCtxRef.current;
    const data = base64ToFloat32(b64);
    const buf = ctx.createBuffer(1, data.length, 24000);
    buf.getChannelData(0).set(data);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    const startAt = Math.max(ctx.currentTime, nextAudioTime.current);
    src.start(startAt);
    nextAudioTime.current = startAt + buf.duration;
  }, []);

  // ---- Handle Server Messages ----
  const handleMsg = useCallback((raw: string) => {
    let msg: any;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.setupComplete) {
      setStatus("ready");
      setStatusText("Connected • Speak now");
      return;
    }

    if (msg.serverContent?.modelTurn?.parts) {
      for (const part of msg.serverContent.modelTurn.parts) {
        if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
          playAudio(part.inlineData.data);
        }
        if (part.text) {
          setTranscript((prev) => prev + part.text);
        }
      }
    }

    // Handle outputAudioTranscription and inputAudioTranscription fields if they come separately
    if (msg.serverContent?.outputTranscription?.text) {
      setTranscript((prev) => prev + msg.serverContent.outputTranscription.text);
    }
    if (msg.serverContent?.inputTranscription?.text) {
      setTranscript((prev) => prev + "\n[You]: " + msg.serverContent.inputTranscription.text + "\n");
    }

    if (msg.serverContent?.turnComplete) {
      setStatusText("Connected • Speak now");
      // Add a newline to separate turns in the transcript
      setTranscript((prev) => prev + "\n\n");
    }
  }, [playAudio]);

  // ---- Connect ----
  const connect = async () => {
    try {
      setStatus("connecting");
      setStatusText("Connecting...");
      setErrorMsg(null);
      setTranscript("");

      let apiKey = userApiKey;
      if (!apiKey) {
        const res = await fetch("/api/live");
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        apiKey = data.apiKey;
      }

      // Init AudioContext (must be inside user gesture)
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        await audioCtxRef.current.audioWorklet.addModule("/pcm-processor.js");
      }
      if (audioCtxRef.current.state === "suspended") await audioCtxRef.current.resume();

      const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${apiKey}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        const systemInstructionText = "You are a helpful and intelligent AI assistant. You have access to the user's live camera and screen share via real-time image frames. Whenever the user asks you to look at something, look at the visual input and describe it accurately (e.g., if they show a book, say 'I see a book'). Never say you do not have access to the camera or screen.";

        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-3.1-flash-live-preview",
            systemInstruction: {
              parts: [{ text: systemInstructionText }]
            },
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
              }
            },
            // Enable transcripts without breaking the AUDIO response modality
            outputAudioTranscription: {},
            inputAudioTranscription: {}
          }
        }));
        // Don't set ready yet — wait for setupComplete
      };

      ws.onmessage = (e) => {
        if (e.data instanceof Blob) {
          const reader = new FileReader();
          reader.onload = () => handleMsg(reader.result as string);
          reader.readAsText(e.data);
        } else {
          handleMsg(e.data);
        }
      };

      ws.onerror = () => {
        setErrorMsg("Connection failed. Check your API key.");
        setStatus("error");
      };

      ws.onclose = (ev) => {
        if (ev.code !== 1000 && ev.code !== 1005) {
          setErrorMsg(`Disconnected (${ev.code}): ${ev.reason || "Check API key / quota"}`);
          setStatus("error");
        } else {
          setStatus("idle");
          setStatusText("Connect to start");
        }
        stopAll(false);
      };

    } catch (e: any) {
      setErrorMsg(e.message || "Failed to connect");
      setStatus("error");
    }
  };

  // ---- Send audio chunk to model ----
  const sendAudio = useCallback((b64: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        realtimeInput: { audio: { mimeType: "audio/pcm;rate=16000", data: b64 } }
      }));
    }
  }, []);

  // ---- Mic Toggle ----
  const toggleMic = async () => {
    if (isMicOn) {
      workletRef.current?.disconnect();
      workletRef.current = null;
      if (captureCtxRef.current) {
        if (captureCtxRef.current.state !== "closed") {
          captureCtxRef.current.close().catch(err => console.error("Error closing captureCtx:", err));
        }
        captureCtxRef.current = null;
      }
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setIsMicOn(false);
      setStatusText("Connected • Speak now");
      return;
    }

    if (status !== "ready") return;

    try {
      // Use device defaults to prevent OverconstrainedError on non-standard setups.
      // AudioContext will handle resampling to 16kHz automatically.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false
      });
      micStreamRef.current = stream;

      // Automatically sync state if the track ends externally
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          workletRef.current?.disconnect();
          workletRef.current = null;
          if (captureCtxRef.current) {
            if (captureCtxRef.current.state !== "closed") {
              captureCtxRef.current.close().catch(err => console.error("Error closing captureCtx:", err));
            }
            captureCtxRef.current = null;
          }
          micStreamRef.current = null;
          setIsMicOn(false);
          setStatusText("Connected • Speak now");
        };
      }

      // Create and persist the AudioContext at 16kHz for capturing
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      captureCtxRef.current = captureCtx;
      await captureCtx.audioWorklet.addModule("/pcm-processor.js");
      
      if (captureCtx.state === "suspended") {
        await captureCtx.resume();
      }

      const src = captureCtx.createMediaStreamSource(stream);
      const worklet = new AudioWorkletNode(captureCtx, "pcm-processor");

      worklet.port.onmessage = (e) => sendAudio(float32ToPCM16Base64(e.data));

      // Connect source → worklet only (NOT to destination → no echo)
      src.connect(worklet);
      workletRef.current = worklet;

      setIsMicOn(true);
      setStatusText("🎤 Listening...");
    } catch (e: any) {
      setErrorMsg("Mic access denied: " + e.message);
    }
  };

  // ---- Send video frame ----
  const sendVideoFrame = useCallback((videoEl: HTMLVideoElement) => {
    if (!canvasRef.current || wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (!videoEl.videoWidth) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    // Scale down image for optimal API performance (max 320px)
    const maxDim = 320;
    let w = videoEl.videoWidth;
    let h = videoEl.videoHeight;
    if (w > maxDim || h > maxDim) {
      if (w > h) {
        h = Math.round((h * maxDim) / w);
        w = maxDim;
      } else {
        w = Math.round((w * maxDim) / h);
        h = maxDim;
      }
    }

    canvasRef.current.width = w;
    canvasRef.current.height = h;
    ctx.drawImage(videoEl, 0, 0, w, h);
    
    const b64 = canvasRef.current.toDataURL("image/jpeg", 0.6).split(",")[1];
    wsRef.current.send(JSON.stringify({
      realtimeInput: { video: { mimeType: "image/jpeg", data: b64 } }
    }));
  }, []);

  // ---- Video Toggle ----
  const toggleVideo = async () => {
    if (isVideoOn) {
      if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
      videoRef.current?.srcObject && (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
      setIsVideoOn(false);
      return;
    }
    if (status !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) { 
        videoRef.current.srcObject = stream; 
        videoRef.current.play().catch(e => console.error("Video play error:", e)); 
      }

      // Automatically sync state if the track ends externally
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
          if (videoRef.current) videoRef.current.srcObject = null;
          setIsVideoOn(false);
        };
      }

      videoIntervalRef.current = setInterval(() => {
        if (videoRef.current) sendVideoFrame(videoRef.current);
      }, 2000); // 2 seconds to keep video frames responsive
      setIsVideoOn(true);
    } catch (e: any) {
      setErrorMsg("Camera error: " + e.message);
    }
  };

  // ---- Screen Toggle ----
  const toggleScreen = async () => {
    if (isScreenOn) {
      if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
      screenRef.current?.srcObject && (screenRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      if (screenRef.current) screenRef.current.srcObject = null;
      setIsScreenOn(false);
      return;
    }
    if (status !== "ready") return;
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      if (screenRef.current) { 
        screenRef.current.srcObject = stream; 
        screenRef.current.play().catch(e => console.error("Screen play error:", e)); 
      }

      // Automatically sync state if the track ends externally (e.g. Chrome's "Stop sharing" button)
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
          if (screenRef.current) screenRef.current.srcObject = null;
          setIsScreenOn(false);
        };
      }

      screenIntervalRef.current = setInterval(() => {
        if (screenRef.current) sendVideoFrame(screenRef.current);
      }, 2000); // 2 seconds to keep screen frames responsive
      setIsScreenOn(true);
    } catch (e: any) {
      setErrorMsg("Screen share error: " + e.message);
    }
  };

  // ---- Stop All ----
  const stopAll = (closeWs = true) => {
    if (closeWs && wsRef.current) { wsRef.current.close(1000); wsRef.current = null; }
    workletRef.current?.disconnect();
    workletRef.current = null;
    if (captureCtxRef.current) {
      if (captureCtxRef.current.state !== "closed") {
        captureCtxRef.current.close().catch(err => console.error("Error closing captureCtx:", err));
      }
      captureCtxRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
    if (screenIntervalRef.current) clearInterval(screenIntervalRef.current);
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    if (screenRef.current?.srcObject) {
      (screenRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
      screenRef.current.srcObject = null;
    }
    setIsMicOn(false);
    setIsVideoOn(false);
    setIsScreenOn(false);
    nextAudioTime.current = 0;
    if (closeWs) {
      setTranscript("");
    }
  };

  const isConnected = status === "ready";

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900/95 border border-zinc-700/80 shadow-2xl rounded-2xl p-4 w-96 z-50 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${status === "ready" ? "text-green-400 animate-pulse" : status === "connecting" ? "text-yellow-400 animate-pulse" : "text-zinc-500"}`} />
          <span className="text-white font-semibold text-sm">Live Communication</span>
        </div>
        <div className="flex items-center gap-2">
          {status === "idle" || status === "error" ? (
            <button onClick={connect} className="px-4 py-1.5 rounded-full text-sm font-medium bg-blue-500 hover:bg-blue-600 text-white transition-colors">
              Connect
            </button>
          ) : (
            <button onClick={() => { stopAll(true); setStatus("idle"); setStatusText("Connect to start"); }} className="px-4 py-1.5 rounded-full text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">
              End
            </button>
          )}
          {onClose && (
            <button onClick={() => { stopAll(false); onClose(); }} className="p-1 hover:bg-zinc-800 rounded-full text-zinc-400 transition-colors">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="text-center text-xs text-zinc-400 mb-3">{statusText}</div>

      {/* Error */}
      {errorMsg && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-3 rounded-lg mb-3">
          <div className="font-bold mb-1 text-sm">⚠️ Connection Failed</div>
          <div className="mb-2 text-zinc-300">{errorMsg}</div>
          
          <div className="mt-3 pt-3 border-t border-red-500/20">
            <div className="font-semibold text-zinc-200 mb-1">Has the default limit run out?</div>
            <div className="text-zinc-400 mb-2 leading-relaxed">
              Our free public API limit might be exhausted. Don't worry! You can easily get your own 100% FREE API key and add it from the <strong>Settings ⚙️</strong> menu to continue using the Live AI.
            </div>
            
            <div className="mt-2 text-zinc-400 font-medium mb-2">Watch how to get a free API Key:</div>
            <div className="rounded-lg overflow-hidden border border-zinc-700 bg-black">
              <iframe 
                className="w-full h-40" 
                src="https://www.youtube.com/embed/Uyn-P2nRvDA?rel=0" 
                title="How to get Gemini API Key" 
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                allowFullScreen>
              </iframe>
            </div>
          </div>
        </div>
      )}

      {/* Voice Selection (only when idle) */}
      {(status === "idle" || status === "error") && (
        <div className="flex gap-4 justify-center py-2">
          <button 
            onClick={() => setVoice("Aoede")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${voice === "Aoede" ? "bg-purple-500/20 border-purple-500 text-purple-300" : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <div className={`w-3 h-3 rounded-full ${voice === "Aoede" ? "bg-purple-500" : "bg-zinc-600"}`}></div>
            Female
          </button>
          <button 
            onClick={() => setVoice("Puck")}
            className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all border ${voice === "Puck" ? "bg-blue-500/20 border-blue-500 text-blue-300" : "bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <div className={`w-3 h-3 rounded-full ${voice === "Puck" ? "bg-blue-500" : "bg-zinc-600"}`}></div>
            Male
          </button>
        </div>
      )}

      {/* Controls (only when connected) */}
      {isConnected && (
        <div className="flex justify-around py-2">
          <button
            onClick={toggleMic}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${isMicOn ? "bg-green-500 text-white shadow-lg shadow-green-500/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            title={isMicOn ? "Mute" : "Unmute"}
          >
            {isMicOn ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            <span className="text-xs">{isMicOn ? "Mute" : "Mic"}</span>
          </button>
          <button
            onClick={toggleVideo}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${isVideoOn ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            title={isVideoOn ? "Stop Camera" : "Share Camera"}
          >
            {isVideoOn ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            <span className="text-xs">{isVideoOn ? "Camera On" : "Camera"}</span>
          </button>
          <button
            onClick={toggleScreen}
            className={`flex flex-col items-center gap-1 p-3 rounded-xl transition-all ${isScreenOn ? "bg-purple-500 text-white shadow-lg shadow-purple-500/30" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            title={isScreenOn ? "Stop Screen" : "Share Screen"}
          >
            {isScreenOn ? <Monitor className="w-5 h-5" /> : <MonitorOff className="w-5 h-5" />}
            <span className="text-xs">{isScreenOn ? "Screen On" : "Screen"}</span>
          </button>
        </div>
      )}

      {/* Transcript */}
      {transcript && (
        <div className="mt-3 p-3 bg-zinc-800/50 border border-zinc-700/50 rounded-xl text-sm text-zinc-300 max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
          <div className="text-xs text-purple-400 font-medium mb-1">Live Subtitles:</div>
          {transcript}
        </div>
      )}

      {/* Hidden video previews */}
      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} autoPlay playsInline muted className={`${isVideoOn ? "block" : "hidden"} mt-2 w-full rounded-lg bg-black max-h-40 object-cover`} />
      <video ref={screenRef} autoPlay playsInline muted className={`${isScreenOn ? "block" : "hidden"} mt-2 w-full rounded-lg bg-black max-h-40 object-cover`} />
    </div>
  );
}
