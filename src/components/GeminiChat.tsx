"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  ArrowLeft,
  Copy,
  Check,
  Download,
  RotateCcw,
  Sparkles,
  Trash2,
  Mic,
  Camera,
  Monitor,
  X,
  Volume2,
  Printer,
  Settings,
  Key,
  FolderUp,
  Folder,
  Paperclip,
  FileText,
  Radio,
  Plus,
  Menu,
  MessageSquare,
  Pencil,
  Square
} from "lucide-react";
import Link from "next/link";
import type { Tool } from "@/lib/tools";
import MarkdownRenderer from "./MarkdownRenderer";
import LiveChat from "./LiveChat";
import FeedbackModal from "./FeedbackModal";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[];
  files?: { mimeType: string; data: string; name: string }[];
  isStreaming?: boolean;
}

interface UploadedDoc {
  name: string;
  content?: string;
  base64?: string;
  mimeType?: string;
  type: 'text' | 'file';
  folder?: string;
}

interface ChatSession {
  id: string;
  toolSlug: string;
  title: string;
  timestamp: number;
  messages: ChatMessage[];
}

export default function GeminiChat({ tool }: { tool: Tool }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLiveOpen, setIsLiveOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [userApiKey, setUserApiKey] = useState("");
  
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [printContent, setPrintContent] = useState("");
  
  // Chat History
  const [chatHistory, setChatHistory] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(`gemini_history_${tool.slug}`);
    if (saved) {
      try {
        setChatHistory(JSON.parse(saved));
      } catch (e) {}
    }
  }, [tool.slug]);

  useEffect(() => {
    if (messages.length > 0 && currentSessionId) {
      setChatHistory(prev => {
        const existingIdx = prev.findIndex(s => s.id === currentSessionId);
        let titleText = messages[0].content;
        if (titleText.includes('[UPLOADED FILES CONTEXT]')) {
           titleText = titleText.split('[UPLOADED FILES CONTEXT]')[0].trim();
        }
        const title = titleText.slice(0, 30) + (titleText.length > 30 ? "..." : "") || "New Chat";
        
        const newSession: ChatSession = {
          id: currentSessionId,
          toolSlug: tool.slug,
          title: existingIdx >= 0 && prev[existingIdx].title !== "New Chat" ? prev[existingIdx].title : title,
          timestamp: existingIdx >= 0 ? prev[existingIdx].timestamp : Date.now(),
          messages: messages
        };
        const updated = existingIdx >= 0 ? [...prev] : [newSession, ...prev];
        if (existingIdx >= 0) updated[existingIdx] = newSession;
        
        const storageData = updated.map(session => ({
          ...session,
          messages: session.messages.map(msg => ({
            ...msg,
            images: [],
            files: msg.files ? msg.files.map(f => ({ ...f, data: '' })) : undefined
          }))
        }));
        
        try {
          localStorage.setItem(`gemini_history_${tool.slug}`, JSON.stringify(storageData));
        } catch (e) {
          console.error("Failed to save chat history to localStorage", e);
        }
        return updated;
      });
    }
  }, [messages, currentSessionId, tool.slug]);

  const loadSession = (sessionId: string) => {
    const session = chatHistory.find(s => s.id === sessionId);
    if (session) {
      setCurrentSessionId(sessionId);
      setMessages(session.messages);
      if (window.innerWidth < 768) setIsSidebarOpen(false);
    }
  };

  const createNewSession = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput("");
    setImages([]);
    setUploadedDocs([]);
    if (window.innerWidth < 768) setIsSidebarOpen(false);
  };

  const deleteSession = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChatHistory(prev => {
      const updated = prev.filter(s => s.id !== sessionId);
      localStorage.setItem(`gemini_history_${tool.slug}`, JSON.stringify(updated));
      return updated;
    });
    if (currentSessionId === sessionId) {
      setCurrentSessionId(null);
      setMessages([]);
    }
  };
  
  // Load API key from local storage
  useEffect(() => {
    const key = localStorage.getItem("gemini_api_key");
    if (key) setUserApiKey(key);
  }, []);

  const saveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem("gemini_api_key", userApiKey);
    setIsSettingsOpen(false);
  };
  
  // Multimodal states
  const [images, setImages] = useState<string[]>([]);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [interimResult, setInterimResult] = useState("");
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Web Speech API
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let currentInterim = "";
        let finalTranscript = "";

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            currentInterim += event.results[i][0].transcript;
          }
        }
        
        setInterimResult(currentInterim);
        if (finalTranscript) {
          setInput((prev) => prev + " " + finalTranscript.trim());
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      };
    }
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
        setRecordingTime(0);
        recordingIntervalRef.current = setInterval(() => {
          setRecordingTime(prev => prev + 1);
        }, 1000);
      } catch (e) {
        console.error(e);
      }
    }
  };

  const captureImageFromStream = (stream: MediaStream) => {
    const video = document.createElement("video");
    video.srcObject = stream;
    video.play();
    
    video.onloadedmetadata = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      
      // Give the video a moment to render a frame
      setTimeout(() => {
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64Image = canvas.toDataURL("image/jpeg").split(",")[1];
        setImages((prev) => [...prev, base64Image]);
        stream.getTracks().forEach(track => track.stop());
      }, 500);
    };
  };

  const handleCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      captureImageFromStream(stream);
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Could not access camera. Please allow permissions.");
    }
  };

  const handleScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      captureImageFromStream(stream);
    } catch (error) {
      console.error("Error accessing screen:", error);
      alert("Could not access screen sharing.");
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const removeDoc = (name: string) => {
    setUploadedDocs((prev) => prev.filter((d) => d.name !== name));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const ignoredPaths = ['node_modules', '.git', '.next', 'dist', 'build', '.DS_Store'];
    
    for (const file of files) {
      if (ignoredPaths.some(p => file.webkitRelativePath.includes(`/${p}/`) || file.webkitRelativePath.includes(`\\${p}\\`))) continue;
      
      const parts = file.webkitRelativePath.split('/');
      const folderName = parts.length > 1 ? parts[0] : undefined;
      
      const isText = file.type.startsWith('text/') || file.type === 'application/json' || file.name.match(/\.(js|ts|jsx|tsx|css|html|md|json|yml|yaml|xml|csv|py|java|c|cpp|go|rs|php|rb|sql)$/i);
      const isPdf = file.type === 'application/pdf';
      const isPpt = file.name.toLowerCase().endsWith('.ppt') || file.name.toLowerCase().endsWith('.pptx') || file.type.includes('presentation') || file.type.includes('powerpoint');
      const isImage = file.type.startsWith('image/');
      
      if (isImage) {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Compress to JPEG with 0.7 quality
          const base64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1];
          setImages(prev => [...prev, base64]);
        };
        img.src = URL.createObjectURL(file);
      } else if (isText) {
        const text = await file.text();
        setUploadedDocs(prev => [...prev, { name: file.webkitRelativePath || file.name, content: text, type: 'text', folder: folderName }]);
      } else if (isPdf || isPpt) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const base64 = (e.target?.result as string).split(',')[1];
          // Get correct mimeType for PPTX just in case
          let mimeType = file.type;
          if (isPpt) mimeType = file.name.endsWith('.pptx') ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation' : (file.name.endsWith('.ppt') ? 'application/vnd.ms-powerpoint' : file.type);
          
          setUploadedDocs(prev => [...prev, { name: file.webkitRelativePath || file.name, base64, mimeType, type: 'file', folder: folderName }]);
        };
        reader.readAsDataURL(file);
      }
    }
    e.target.value = '';
  };

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [input]);

  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const speakText = (text: string, gender: "male" | "female", messageId: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      
      if (speakingMessageId === messageId) {
        setSpeakingMessageId(null);
        return;
      }

      setSpeakingMessageId(messageId);
      const cleanText = text.replace(/[#*_~`]/g, "");
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utteranceRef.current = utterance;
      
      utterance.onend = () => {
        setSpeakingMessageId(null);
      };

      utterance.onerror = () => {
        setSpeakingMessageId(null);
      };

      // In some browsers (like Chrome Android), voices take time to load.
      // If it's empty, speech might still work with defaults.
      const voices = window.speechSynthesis.getVoices();
      
      let selectedVoice;
      if (gender === "female") {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes("female") || v.name.toLowerCase().includes("zira") || v.name.toLowerCase().includes("samantha") || v.name.toLowerCase().includes("victoria"));
      } else {
        selectedVoice = voices.find(v => v.name.toLowerCase().includes("male") || v.name.toLowerCase().includes("david") || v.name.toLowerCase().includes("daniel") || v.name.toLowerCase().includes("mark"));
      }
      
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else if (voices.length > 0) {
        // Fallback for mobile devices where gender isn't in the name
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        if (englishVoices.length > 0) {
          if (gender === "male") {
            // Find a UK voice (often male on Android) or lower the pitch of the default voice
            const gbVoice = englishVoices.find(v => v.lang.includes('GB'));
            utterance.voice = gbVoice || englishVoices[0];
            utterance.pitch = 0.8; // Lower pitch to sound more masculine
            utterance.rate = 0.95;
          } else {
            utterance.voice = englishVoices[0]; // First voice is usually female by default
            utterance.pitch = 1.1; // Slightly higher pitch
          }
        } else {
           if (gender === "male") utterance.pitch = 0.8;
           if (gender === "female") utterance.pitch = 1.1;
        }
      } else {
         // If voices array is empty (often true on first call on mobile), just adjust pitch
         if (gender === "male") utterance.pitch = 0.8;
         if (gender === "female") utterance.pitch = 1.1;
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isListening) {
      toggleListening();
    }

    let finalContent = (input + " " + interimResult).trim();

    if ((!finalContent && images.length === 0 && uploadedDocs.length === 0) || isLoading) return;

    if (uploadedDocs.length > 0) {
      const textDocs = uploadedDocs.filter(d => d.type === 'text');
      if (textDocs.length > 0) {
        finalContent += "\n\n[UPLOADED FILES CONTEXT]\n";
        textDocs.forEach(doc => {
          finalContent += `### \`${doc.name}\`\n\`\`\`\n${doc.content}\n\`\`\`\n\n`;
        });
      }
    }

    const binaryFiles = uploadedDocs.filter(d => d.type === 'file').map(d => ({
      mimeType: d.mimeType!,
      data: d.base64!,
      name: d.name
    }));

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: finalContent,
      images: [...images],
      files: binaryFiles.length > 0 ? binaryFiles : undefined,
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    let sessionId = currentSessionId;
    if (!sessionId) {
      sessionId = Date.now().toString();
      setCurrentSessionId(sessionId);
    }

    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput("");
    setInterimResult("");
    setImages([]);
    setUploadedDocs([]);
    setIsLoading(true);

    try {
      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content, images: m.images, files: m.files })),
        { role: userMessage.role, content: userMessage.content, images: userMessage.images, files: userMessage.files },
      ];

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userApiKey) {
        headers["x-user-api-key"] = userApiKey;
      }

      let response;
      let retries = 2;
      let lastError: any = null;

      while (retries >= 0) {
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: allMessages,
              toolSlug: tool.slug,
            }),
          });
          
          if (response.ok) break; // Success!
          
          if (response.status === 429 || response.status === 400 || response.status === 401 || response.status === 403) {
            // Client errors or quota errors, don't retry
            break;
          }
          
          if (response.status >= 500 && retries > 0) {
            // Vercel cold-start timeout or server error, wait a bit and retry
            await new Promise(r => setTimeout(r, 1500));
            retries--;
            continue;
          }
          
          break; // Other errors, break and handle below
        } catch (e) {
          lastError = e;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, 1500));
            retries--;
            continue;
          }
          break;
        }
      }

      if (!response || !response.ok) {
        let errorMsg = lastError?.message || "Failed to get response (Server timeout or error)";
        if (response) {
          try {
            const textContent = await response.text();
            try {
              const errorData = JSON.parse(textContent);
              errorMsg = errorData.error || textContent || errorMsg;
            } catch {
              errorMsg = textContent || errorMsg;
            }
          } catch(e) {}
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        fullContent += text;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: fullContent, isStreaming: true }
              : m
          )
        );
      }

      // Finalize message
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: fullContent, isStreaming: false }
            : m
        )
      );

    } catch (err: any) {
      console.error("Chat error:", err);
      
      if (err.message === "QUOTA_EXCEEDED") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: "⚠️ **You have reached your free daily limit.**\n\n<byok-trigger></byok-trigger>", isStreaming: false }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: err.message || "Sorry, an error occurred. Please try again.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditSubmit = async (messageId: string, newContent: string) => {
    if (!newContent.trim() || isLoading) return;
    
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;
    
    const originalMessage = messages[messageIndex];
    
    let finalContent = newContent.trim();
    // Re-append uploaded files context if it existed in the original message
    if (originalMessage.content.includes('[UPLOADED FILES CONTEXT]')) {
      const filesContext = originalMessage.content.substring(originalMessage.content.indexOf('\n\n[UPLOADED FILES CONTEXT]\n'));
      if (filesContext) {
        finalContent += filesContext;
      }
    }
    
    const userMessage: ChatMessage = {
      ...originalMessage,
      content: finalContent
    };

    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isStreaming: true,
    };
    
    const truncatedMessages = messages.slice(0, messageIndex);
    setMessages([...truncatedMessages, userMessage, assistantMessage]);
    setEditingMessageId(null);
    setIsLoading(true);

    try {
      const allMessages = [
        ...truncatedMessages.map((m) => ({ role: m.role, content: m.content, images: m.images, files: m.files })),
        { role: userMessage.role, content: userMessage.content, images: userMessage.images, files: userMessage.files },
      ];

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (userApiKey) {
        headers["x-user-api-key"] = userApiKey;
      }

      let response;
      let retries = 2;
      let lastError: any = null;

      while (retries >= 0) {
        try {
          response = await fetch("/api/chat", {
            method: "POST",
            headers,
            body: JSON.stringify({
              messages: allMessages,
              toolSlug: tool.slug,
            }),
          });
          
          if (response.ok) break; // Success!
          
          if (response.status === 429 || response.status === 400 || response.status === 401 || response.status === 403) {
            // Client errors or quota errors, don't retry
            break;
          }
          
          if (response.status >= 500 && retries > 0) {
            // Vercel cold-start timeout or server error, wait a bit and retry
            await new Promise(r => setTimeout(r, 1500));
            retries--;
            continue;
          }
          
          break; // Other errors, break and handle below
        } catch (e) {
          lastError = e;
          if (retries > 0) {
            await new Promise(r => setTimeout(r, 1500));
            retries--;
            continue;
          }
          break;
        }
      }

      if (!response || !response.ok) {
        let errorMsg = lastError?.message || "Failed to get response (Server timeout or error)";
        if (response) {
          try {
            const textContent = await response.text();
            try {
              const errorData = JSON.parse(textContent);
              errorMsg = errorData.error || textContent || errorMsg;
            } catch {
              errorMsg = textContent || errorMsg;
            }
          } catch(e) {}
        }
        throw new Error(errorMsg);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No reader");

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        fullContent += text;

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: fullContent, isStreaming: true }
              : m
          )
        );
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? { ...m, content: fullContent, isStreaming: false }
            : m
        )
      );

    } catch (err: any) {
      console.error("Chat error:", err);
      
      if (err.message === "QUOTA_EXCEEDED") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: "⚠️ **You have reached your free daily limit.**\n\n<byok-trigger></byok-trigger>", isStreaming: false }
              : m
          )
        );
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? { ...m, content: err.message || "Sorry, an error occurred. Please try again.", isStreaming: false }
              : m
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExampleClick = (prompt: string) => {
    setInput(prompt);
    textareaRef.current?.focus();
  };

  const clearChat = () => {
    setMessages([]);
  };

  const regenerate = () => {
    const lastUserMessage = [...messages]
      .reverse()
      .find((m) => m.role === "user");
    if (lastUserMessage) {
      setMessages((prev) => {
        const newMessages = [...prev];
        if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === "assistant") {
          newMessages.pop();
        }
        return newMessages;
      });
      setInput(lastUserMessage.content);
      if (lastUserMessage.images) {
        setImages(lastUserMessage.images);
      }
      setTimeout(() => handleSubmit(), 100);
    }
  };

  const downloadAsPDF = async (messageId: string, filename: string) => {
    const element = document.getElementById(`message-content-${messageId}`);
    if (!element) return;
    
    try {
      // Clone element to prevent styling issues on the actual chat
      const clone = element.cloneNode(true) as HTMLElement;
      
      // Remove video/audio/iframe/button elements that might break PDF generation
      const mediaTags = clone.querySelectorAll('video, audio, iframe, button, .no-print');
      mediaTags.forEach(tag => tag.remove());
      
      setPrintContent(clone.innerHTML);
      
      // Allow React to render the printContent DOM, then trigger print
      setTimeout(() => {
        window.print();
        setPrintContent("");
      }, 150);
    } catch (err) {
      console.error("PDF printing failed:", err);
      alert("Failed to print PDF. Please try again.");
    }
  };

  const downloadAsZip = async (messageContent: string, filename: string) => {
    try {
      const zip = new JSZip();
      
      // Look for format: ### `filename.ext` followed by ```language\ncode\n```
      const regex = /###\s*`?([a-zA-Z0-9_\-\.\/]+)`?\s*\n+```[a-zA-Z]*\n([\s\S]*?)```/g;
      let match;
      let fileCount = 0;

      while ((match = regex.exec(messageContent)) !== null) {
        const filePath = match[1].trim();
        const fileContent = match[2];
        zip.file(filePath, fileContent);
        fileCount++;
      }

      if (fileCount === 0) {
        alert("No complete project files found in this response. Ask the AI to output files as '### `filename`' followed by a code block.");
        return;
      }

      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, filename);
    } catch (error) {
      console.error("Error creating zip:", error);
      alert("Failed to create ZIP file.");
    }
  };

  return (
    <>
      <div id="main-chat-layout" className="flex h-full w-full bg-zinc-950 overflow-hidden relative">
      
      {/* Sidebar Overlay (Mobile) */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm" 
          onClick={() => setIsSidebarOpen(false)} 
        />
      )}

      {/* Sidebar */}
      <div className={`fixed md:relative z-50 h-full bg-zinc-950 border-r border-zinc-800/50 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-72 -translate-x-full md:w-0 md:border-r-0 overflow-hidden shadow-2xl md:shadow-none'}`}>
        <div className="p-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            Chat History
          </h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="px-3 pb-3">
          <button 
            onClick={createNewSession}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 text-zinc-200 hover:bg-purple-500/20 rounded-xl transition-colors text-sm font-medium shadow-sm"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 pt-0 space-y-1">
          {chatHistory.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-center px-4">
              <div className="w-10 h-10 rounded-full bg-zinc-900 flex items-center justify-center mb-3">
                <MessageSquare className="w-4 h-4 text-zinc-600" />
              </div>
              <p className="text-xs text-zinc-500">No previous chats for this tool.</p>
            </div>
          ) : (
            chatHistory.map(session => (
              <div 
                key={session.id}
                onClick={() => loadSession(session.id)}
                className={`group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all ${currentSessionId === session.id ? 'bg-zinc-800 border border-zinc-700 text-white shadow-md' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'}`}
              >
                <div className="flex-1 truncate text-sm pr-2">
                  {session.title}
                </div>
                <button 
                  onClick={(e) => deleteSession(session.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/20 text-red-400 transition-all flex-shrink-0"
                  title="Delete chat"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full min-w-0 min-h-0 bg-zinc-950 relative">
        <header className="flex-shrink-0 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl p-4 flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)} 
              className={`p-2 rounded-xl transition-colors md:mr-2 ${isSidebarOpen ? 'bg-zinc-800 text-white hidden md:block' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
              title="Toggle Sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link
              href="/"
              className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors hidden sm:block"
              title="Back to Tools"
            >
              <ArrowLeft className="w-5 h-5 text-zinc-400" />
            </Link>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{tool.icon}</span>
              <div>
                <h1 className="text-base font-semibold text-white truncate max-w-[200px] sm:max-w-none">
                  {tool.name}
                </h1>
                <p className="text-xs text-zinc-500">{tool.description}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFeedbackModalOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full text-blue-300 bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors text-sm font-medium"
              title="Give Feedback"
            >
              <MessageSquare className="w-4 h-4" />
              Feedback
            </button>
            {messages.length > 0 && (
              <>
                <button
                  onClick={regenerate}
                  className="p-2 rounded-xl hover:bg-zinc-800/50 transition-colors"
                  title="Regenerate"
                >
                  <RotateCcw className="w-4 h-4 text-zinc-400" />
                </button>
                <button
                  onClick={clearChat}
                  className="p-2 rounded-xl hover:bg-zinc-800/50 transition-colors"
                  title="Clear chat"
                >
                  <Trash2 className="w-4 h-4 text-zinc-400" />
                </button>
              </>
            )}
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 rounded-xl hover:bg-zinc-800/50 transition-colors"
              title="API Key Settings"
            >
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </header>
      
      <div className={isLiveOpen ? "block" : "hidden"}>
        <LiveChat userApiKey={userApiKey} onClose={() => setIsLiveOpen(false)} />
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
            <button onClick={() => setIsSettingsOpen(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition-colors">
              <X className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-purple-500/20 rounded-xl">
                <Key className="w-6 h-6 text-purple-400" />
              </div>
              <h2 className="text-xl font-bold text-white">API Settings</h2>
            </div>
            <p className="text-zinc-400 text-sm mb-6">
              Enter your Free Google Gemini API Key to use this AI without limits. Your key is saved locally in your browser.
            </p>
            <form onSubmit={saveApiKey}>
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-zinc-300 mb-2">Gemini API Key</label>
                  <input
                    type="password"
                    value={userApiKey}
                    onChange={(e) => setUserApiKey(e.target.value)}
                    placeholder="AIzaSy..."
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                  <p className="text-xs text-zinc-500 mt-2">
                    Get your free key from <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-purple-400 hover:underline">Google AI Studio</a>.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setIsSettingsOpen(false)} className="px-5 py-2.5 rounded-xl font-medium text-zinc-300 hover:bg-zinc-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" className="px-5 py-2.5 rounded-xl font-medium bg-purple-600 hover:bg-purple-700 text-white transition-colors">
                  Save Key
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)} 
      />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {messages.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center h-full px-4">
            <div className="text-6xl mb-6">{tool.icon}</div>
            <h2 className="text-2xl font-bold text-white mb-2">{tool.name}</h2>
            <p className="text-zinc-500 text-center max-w-md mb-8">
              {tool.description}
            </p>

            {/* Example Prompts */}
            <div className="w-full max-w-2xl space-y-3">
              <p className="text-xs uppercase tracking-widest text-zinc-600 mb-3">
                Try these examples
              </p>
              {tool.examplePrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(prompt)}
                  className="w-full text-left p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl hover:border-purple-500/30 hover:bg-zinc-900/80 transition-all text-sm text-zinc-400 hover:text-zinc-300"
                >
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-purple-400 flex-shrink-0" />
                    <span>{prompt}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Chat Messages */
          <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`animate-fade-in ${
                  message.role === "user" ? "flex justify-end" : ""
                }`}
              >
                {message.role === "user" ? (
                  /* User Message */
                  <div className="group relative max-w-[80%] bg-purple-500/10 border border-purple-500/20 rounded-2xl rounded-tr-md px-5 py-3">
                    {editingMessageId === message.id ? (
                      <div className="flex flex-col gap-2 w-full min-w-[250px] sm:min-w-[400px]">
                        <textarea
                          value={editInput}
                          onChange={(e) => setEditInput(e.target.value)}
                          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none min-h-[100px]"
                          autoFocus
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => setEditingMessageId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-lg transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleEditSubmit(message.id, editInput)}
                            disabled={isLoading || !editInput.trim()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Save & Submit
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => {
                            setEditingMessageId(message.id);
                            const contentToEdit = message.content.includes('[UPLOADED FILES CONTEXT]') 
                              ? message.content.split('[UPLOADED FILES CONTEXT]')[0].trim()
                              : message.content;
                            setEditInput(contentToEdit);
                          }}
                          className="absolute -left-10 top-2 p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center bg-zinc-950/50 shadow-sm border border-zinc-800/50"
                          title="Edit message"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        
                        {message.images && message.images.length > 0 && (
                          <div className="flex gap-2 mb-2 flex-wrap">
                            {message.images.map((img, idx) => (
                              <img 
                                key={idx} 
                                src={`data:image/jpeg;base64,${img}`} 
                                alt="Attached" 
                                className="w-24 h-24 object-cover rounded-lg border border-purple-500/30"
                              />
                            ))}
                          </div>
                        )}
                        {message.files && message.files.length > 0 && (
                          <div className="flex gap-2 mb-2 flex-wrap">
                            {message.files.map((file, idx) => (
                              <div key={idx} className="flex items-center gap-2 bg-zinc-800/50 p-2 rounded-lg border border-zinc-700/50">
                                <FileText className="w-4 h-4 text-purple-400" />
                                <span className="text-xs text-zinc-300 max-w-[150px] truncate">{file.name}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-zinc-200 whitespace-pre-wrap text-sm leading-relaxed">
                          {message.content.includes('[UPLOADED FILES CONTEXT]') 
                            ? message.content.split('[UPLOADED FILES CONTEXT]')[0].trim()
                            : message.content}
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  /* Assistant Message */
                  <div className="space-y-2 max-w-[90%]">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{tool.icon}</span>
                      <span className="text-xs font-medium text-zinc-500">
                        {tool.name}
                      </span>
                    </div>

                    <div className="prose-chat text-sm bg-zinc-900/50 border border-zinc-800/80 text-zinc-100 p-4 rounded-xl shadow-sm" id={`message-content-${message.id}`}>
                      {message.content ? (
                        <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:my-0">
                          <MarkdownRenderer 
                            content={message.content} 
                            onOpenSettings={() => setIsSettingsOpen(true)}
                          />
                        </div>
                      ) : (
                        /* Typing indicator */
                        <div className="flex items-center gap-1.5 py-2">
                          <div className="w-2 h-2 rounded-full bg-purple-400 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-purple-400 typing-dot" />
                          <div className="w-2 h-2 rounded-full bg-purple-400 typing-dot" />
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    {!message.isStreaming && message.content && (
                      <div className="flex items-center gap-1.5 mt-2">
                        <button
                          onClick={() =>
                            copyToClipboard(message.content, message.id)
                          }
                          title="Copy text"
                          className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-zinc-800/50 transition-colors text-zinc-500 hover:text-zinc-300"
                        >
                          {copiedId === message.id ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          onClick={() => speakText(message.content, "female", message.id)}
                          title={speakingMessageId === message.id ? "Stop Voice" : "Play Voice"}
                          className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${speakingMessageId === message.id ? 'bg-purple-500/20 text-purple-300' : 'hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-300'}`}
                        >
                          <Volume2 className={`w-4 h-4 ${speakingMessageId === message.id ? 'text-purple-400 animate-pulse' : ''}`} />
                        </button>
                        <button
                          onClick={() =>
                            downloadAsPDF(
                              message.id,
                              `${tool.slug}-response.pdf`
                            )
                          }
                          title="Download PDF"
                          className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors bg-purple-500/10 text-purple-400 border border-purple-500/20 hover:bg-purple-500/20 ml-1"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        
                        {tool.outputType === "code" && (
                          <button
                            onClick={() =>
                              downloadAsZip(
                                message.content,
                                `${tool.slug}-project.zip`
                              )
                            }
                            title="Download Project ZIP"
                            className="flex items-center gap-1 px-2 h-8 rounded-lg transition-colors bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 ml-1 text-xs font-medium"
                          >
                            <Download className="w-4 h-4" /> ZIP
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <form onSubmit={handleSubmit} className="relative">
            
            {/* Image Preview Area */}
            {(images.length > 0 || uploadedDocs.length > 0) && (
              <div className="flex gap-2 mb-3 pb-3 border-b border-zinc-800/50 overflow-x-auto">
                {images.map((img, idx) => (
                  <div key={idx} className="relative w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 group">
                    <img src={`data:image/jpeg;base64,${img}`} className="w-full h-full object-cover" alt="Preview" />
                    <button 
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-black/60 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                
                {/* Grouped Folders */}
                {Array.from(new Set(uploadedDocs.filter(d => d.folder).map(d => d.folder))).map((folder, idx) => (
                  <div key={`folder-${idx}`} className="relative h-16 px-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 flex items-center justify-center flex-shrink-0 group min-w-[140px]">
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      <Folder className="w-5 h-5 text-blue-400 flex-shrink-0" />
                      <span className="text-xs text-zinc-300 truncate font-medium" title={folder}>
                        {folder}
                      </span>
                      <span className="text-[10px] bg-zinc-700 px-1.5 py-0.5 rounded-full text-zinc-400 whitespace-nowrap">
                        {uploadedDocs.filter(d => d.folder === folder).length} files
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => setUploadedDocs(prev => prev.filter(d => d.folder !== folder))}
                      className="absolute top-1 right-1 bg-black/80 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}

                {/* Standalone Files */}
                {uploadedDocs.filter(d => !d.folder).map((doc, idx) => (
                  <div key={`doc-${idx}`} className="relative h-16 px-3 bg-zinc-800/50 rounded-lg border border-zinc-700/50 flex items-center justify-center flex-shrink-0 group min-w-[120px]">
                    <div className="flex items-center gap-2 overflow-hidden w-full">
                      <FileText className="w-5 h-5 text-purple-400 flex-shrink-0" />
                      <span className="text-xs text-zinc-300 truncate" title={doc.name}>
                        {doc.name.split('/').pop()}
                      </span>
                    </div>
                    <button 
                      type="button"
                      onClick={() => removeDoc(doc.name)}
                      className="absolute top-1 right-1 bg-black/80 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
              multiple 
              className="hidden" 
              accept="image/*,application/pdf,text/*,.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation" 
            />
            <input 
              type="file" 
              ref={folderInputRef} 
              onChange={handleFileUpload} 
              // @ts-ignore
              webkitdirectory="true" 
              directory="true" 
              multiple 
              className="hidden" 
            />

            <div className="flex items-end gap-2 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-2 focus-within:border-purple-500/30 focus-within:ring-2 focus-within:ring-purple-500/10 transition-all">
              
              {/* Media Buttons */}
              <div className="relative flex items-center justify-center ml-1">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen(!isMenuOpen)}
                  className={`p-2 rounded-full transition-colors ${isMenuOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}
                  title="Add attachment"
                >
                  <Plus className={`w-5 h-5 transition-transform ${isMenuOpen ? 'rotate-45' : ''}`} />
                </button>

                {isMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsMenuOpen(false)}
                    />
                    <div className="absolute bottom-full left-0 mb-3 w-60 bg-zinc-900 border border-zinc-700/50 rounded-xl shadow-2xl overflow-hidden flex flex-col py-1 z-50 animate-in fade-in slide-in-from-bottom-2">
                      <button
                        type="button"
                        onClick={() => { folderInputRef.current?.click(); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className="p-1.5 rounded-md bg-yellow-500/10 text-yellow-400 group-hover:bg-yellow-500/20 transition-colors">
                          <FolderUp className="w-4 h-4" />
                        </div>
                        Upload Project Folder
                      </button>
                      <button
                        type="button"
                        onClick={() => { fileInputRef.current?.click(); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className="p-1.5 rounded-md bg-orange-500/10 text-orange-400 group-hover:bg-orange-500/20 transition-colors">
                          <Paperclip className="w-4 h-4" />
                        </div>
                        Upload File (PDF/PPT/Image)
                      </button>
                      <div className="h-px bg-zinc-800 my-1 mx-2" />
                      <button
                        type="button"
                        onClick={() => { handleCamera(); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className="p-1.5 rounded-md bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20 transition-colors">
                          <Camera className="w-4 h-4" />
                        </div>
                        Capture from Camera
                      </button>
                      <button
                        type="button"
                        onClick={() => { handleScreenShare(); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                          <Monitor className="w-4 h-4" />
                        </div>
                        Share Screen
                      </button>
                      <div className="h-px bg-zinc-800 my-1 mx-2" />
                      <button
                        type="button"
                        onClick={() => { toggleListening(); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className={`p-1.5 rounded-md transition-colors ${isListening ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-green-500/10 text-green-400 group-hover:bg-green-500/20'}`}>
                          <Mic className="w-4 h-4" />
                        </div>
                        {isListening ? "Stop Listening" : "Start Voice Input"}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsLiveOpen(!isLiveOpen); setIsMenuOpen(false); }}
                        className="flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 transition-colors text-sm text-zinc-300 text-left w-full group"
                      >
                        <div className="p-1.5 rounded-md bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors">
                          <Radio className="w-4 h-4" />
                        </div>
                        Live Communication
                      </button>
                    </div>
                  </>
                )}
              </div>

              <textarea
                ref={textareaRef}
                value={(input + (interimResult ? " " + interimResult : "")).trimStart()}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Ask ${tool.name} anything...`}
                rows={1}
                className="flex-1 bg-transparent text-white placeholder-zinc-500 resize-none focus:outline-none py-2 px-3 text-sm max-h-[200px] leading-relaxed"
              />
              
              {isListening && (
                <div className="flex items-center gap-2 px-3 py-1.5 mr-2 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 animate-pulse font-medium text-xs">
                  <div className="w-2 h-2 rounded-full bg-red-500" />
                  {formatTime(recordingTime)}
                </div>
              )}

              {input.trim() === "" && images.length === 0 && uploadedDocs.length === 0 && !isListening ? (
                <button
                  type="button"
                  onClick={toggleListening}
                  className="p-2.5 rounded-xl bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-all flex-shrink-0"
                  title="Voice Input"
                >
                  <Mic className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={(!input.trim() && images.length === 0 && uploadedDocs.length === 0 && !isListening) || isLoading}
                  className="p-2.5 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed hover:from-purple-600 hover:to-blue-600 transition-all flex-shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
          <p className="text-xs text-zinc-600 text-center mt-2">
            MultiProAI can make mistakes. Verify important information.
          </p>
        </div>
        </div>
      </div>
      </div>
      {printContent && (
        <div id="print-area" className="hidden print:block bg-white text-black p-8">
          <div dangerouslySetInnerHTML={{ __html: printContent }} />
        </div>
      )}
    </>
  );
}
