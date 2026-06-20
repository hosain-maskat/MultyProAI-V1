import { useState, useRef, useEffect } from "react";
import { MessageSquarePlus, X, UploadCloud, Loader2, Image as ImageIcon, Trash2, History, Send } from "lucide-react";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface PastFeedback {
  id: string;
  date: string;
  text: string;
  hasImage: boolean;
}

// Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymCsmRCeCuisIwVdL4zsq6aGQaMv88YtRCksb8dNyjwZri3pPgjT0YJK5MmZPhv6Em/exec";

export default function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [tab, setTab] = useState<"new" | "history">("new");
  const [name, setName] = useState("");
  const [feedback, setFeedback] = useState("");
  const [imageStr, setImageStr] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pastFeedback, setPastFeedback] = useState<PastFeedback[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem("multiproai_feedback_history");
      if (saved) {
        try {
          setPastFeedback(JSON.parse(saved));
        } catch (e) {}
      }
      // Load saved name if any
      const savedName = localStorage.getItem("multiproai_username");
      if (savedName && !name) {
        setName(savedName);
      }
    }
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageStr(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
            setImageStr(reader.result as string);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !feedback.trim()) return;

    setIsSubmitting(true);
    localStorage.setItem("multiproai_username", name.trim());

    try {
      const payload = {
        name: name.trim(),
        feedback: feedback.trim(),
        image: imageStr ? imageStr.split(",")[1] : "", // Send only base64 data
        mimeType: imageStr ? imageStr.substring(5, imageStr.indexOf(";")) : ""
      };

      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", // Required to bypass CORS on Google Apps Script
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload)
      });

      const newFeedback: PastFeedback = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString(),
        text: feedback,
        hasImage: !!imageStr
      };

      const newHistory = [newFeedback, ...pastFeedback];
      setPastFeedback(newHistory);
      localStorage.setItem("multiproai_feedback_history", JSON.stringify(newHistory));

      setFeedback("");
      setImageStr(null);
      setTab("history");
      alert("Feedback submitted securely to the developer!");
      
    } catch (error) {
      console.error(error);
      alert("Failed to submit feedback. Please check your internet connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg shadow-2xl relative flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-purple-500/20 rounded-xl">
              <MessageSquarePlus className="w-5 h-5 text-purple-400" />
            </div>
            <h2 className="text-xl font-bold text-white">Support & Feedback</h2>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Tabs */}
        <div className="flex px-5 pt-3 border-b border-zinc-800/50 flex-shrink-0">
          <button
            onClick={() => setTab("new")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === "new" ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-400 hover:text-zinc-300"}`}
          >
            Send Feedback
          </button>
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${tab === "history" ? "border-purple-500 text-purple-400" : "border-transparent text-zinc-400 hover:text-zinc-300"}`}
          >
            <History className="w-4 h-4" />
            My Feedback
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 custom-scrollbar">
          {tab === "new" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Your Name / ID</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. John Doe or User123"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Describe the Issue or Idea</label>
                <textarea
                  required
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onPaste={handlePaste}
                  placeholder="What happened? Or what feature would you like? (You can paste screenshots here directly using Ctrl+V)"
                  rows={4}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500/50 text-sm resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-300 mb-1.5">Attach Screenshot (Optional)</label>
                
                {imageStr ? (
                  <div className="relative group rounded-xl border border-zinc-700/50 overflow-hidden bg-black/50 aspect-video flex items-center justify-center">
                    <img src={imageStr} alt="Screenshot preview" className="max-h-full max-w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setImageStr(null)}
                      className="absolute top-2 right-2 p-1.5 bg-black/70 hover:bg-red-500/80 text-white rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-zinc-800 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors group"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-800 group-hover:bg-purple-500/20 flex items-center justify-center mb-3 transition-colors">
                      <ImageIcon className="w-5 h-5 text-zinc-400 group-hover:text-purple-400" />
                    </div>
                    <p className="text-sm font-medium text-zinc-300 mb-1">Click to upload or drag & drop</p>
                    <p className="text-xs text-zinc-500">PNG, JPG, or GIF (max 5MB)</p>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      onChange={handleFileChange} 
                      accept="image/*" 
                      className="hidden" 
                    />
                  </div>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !feedback.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-500/20"
                >
                  {isSubmitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Submitting securely...</>
                  ) : (
                    <><Send className="w-4 h-4" /> Submit to Developer</>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {pastFeedback.length === 0 ? (
                <div className="text-center py-10">
                  <History className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm">You haven't submitted any feedback yet.</p>
                </div>
              ) : (
                pastFeedback.map(fb => (
                  <div key={fb.id} className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">
                        {fb.date}
                      </span>
                      {fb.hasImage && <div title="Screenshot attached"><ImageIcon className="w-3.5 h-3.5 text-zinc-500" /></div>}
                    </div>
                    <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">{fb.text}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
