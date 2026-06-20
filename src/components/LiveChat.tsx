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
      }
    }

    if (msg.serverContent?.turnComplete) {
      setStatusText("Connected • Speak now");
    }
  }, [playAudio]);

  // ---- Connect ----
  const connect = async () => {
    try {
      setStatus("connecting");
      setStatusText("Connecting...");
      setErrorMsg(null);

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

      const ws = new WebSocket(
        `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        const systemInstructionText = voice === "Puck" 
          ? "You are a helpful male AI assistant with a deep male voice. You must sound like a man." 
          : "You are a helpful female AI assistant with a sweet female voice. You must sound like a woman.";

        ws.send(JSON.stringify({
          setup: {
            model: "models/gemini-2.5-flash-native-audio-latest",
            systemInstruction: {
              parts: [{ text: systemInstructionText }]
            },
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } }
              }
            }
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
        realtimeInput: { mediaChunks: [{ mimeType: "audio/pcm;rate=16000", data: b64 }] }
      }));
    }
  }, []);

  // ---- Mic Toggle ----
  const toggleMic = async () => {
    if (isMicOn) {
      workletRef.current?.disconnect();
      workletRef.current = null;
      micStreamRef.current?.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      setIsMicOn(false);
      return;
    }

    if (status !== "ready") return;

    try {
      // Use 16kHz capture for sending
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
        video: false
      });
      micStreamRef.current = stream;

      // Create a SEPARATE AudioContext at 16kHz just for capturing
      const captureCtx = new AudioContext({ sampleRate: 16000 });
      await captureCtx.audioWorklet.addModule("/pcm-processor.js");
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
    canvasRef.current.width = Math.min(320, videoEl.videoWidth / 2);
    canvasRef.current.height = Math.min(240, videoEl.videoHeight / 2);
    ctx.drawImage(videoEl, 0, 0, canvasRef.current.width, canvasRef.current.height);
    const b64 = canvasRef.current.toDataURL("image/jpeg", 0.4).split(",")[1];
    wsRef.current!.send(JSON.stringify({
      realtimeInput: { mediaChunks: [{ mimeType: "image/jpeg", data: b64 }] }
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
      videoIntervalRef.current = setInterval(() => {
        if (videoRef.current) sendVideoFrame(videoRef.current);
      }, 1500);
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
      screenIntervalRef.current = setInterval(() => {
        if (screenRef.current) sendVideoFrame(screenRef.current);
      }, 1500);
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
  };

  const isConnected = status === "ready";

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-zinc-900/95 border border-zinc-700/80 shadow-2xl rounded-2xl p-4 w-96 z-50 backdrop-blur-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Radio className={`w-4 h-4 ${status === "ready" ? "text-green-400 animate-pulse" : status === "connecting" ? "text-yellow-400 animate-pulse" : "text-zinc-500"}`} />
          <span className="text-white font-semibold text-sm">Gemini Live Voice</span>
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
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-3 py-2 rounded-lg mb-3">
          {errorMsg}
          <div className="mt-1 text-zinc-500">If quota exceeded, add your API Key via Settings ⚙️</div>
        </div>
      )}

      {/* Voice Selection (only when idle) */}
      {(status === "idle" || status === "error") && (
        <div className="flex gap-4 justify-center py-2">
          <label className="text-sm text-zinc-400 flex items-center gap-2 cursor-pointer">
            <input type="radio" name="voice" checked={voice === "Aoede"} onChange={() => setVoice("Aoede")} className="accent-purple-500" />
            Female (Aoede)
          </label>
          <label className="text-sm text-zinc-400 flex items-center gap-2 cursor-pointer">
            <input type="radio" name="voice" checked={voice === "Puck"} onChange={() => setVoice("Puck")} className="accent-purple-500" />
            Male (Puck)
          </label>
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

      {/* Hidden video previews */}
      <canvas ref={canvasRef} className="hidden" />
      <video ref={videoRef} autoPlay playsInline muted className={`${isVideoOn ? "block" : "hidden"} mt-2 w-full rounded-lg bg-black max-h-40 object-cover`} />
      <video ref={screenRef} autoPlay playsInline muted className={`${isScreenOn ? "block" : "hidden"} mt-2 w-full rounded-lg bg-black max-h-40 object-cover`} />
    </div>
  );
}
