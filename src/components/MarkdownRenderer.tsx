"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useState } from "react";
import { Copy, Check, Download, Folder, FileText } from "lucide-react";
import JSZip from "jszip";
import { saveAs } from "file-saver";

interface MarkdownRendererProps {
  content: string;
  onOpenSettings?: () => void;
}

export interface CodeFile {
  path: string;
  language: string;
  content: string;
}

export type Token = 
  | { type: 'text'; content: string }
  | { type: 'project'; files: CodeFile[] };

// Tokenizes content to group adjacent files starting with H3 filepath header
export function tokenizeContent(content: string): Token[] {
  if (!content) return [];
  const fileBlockRegex = /###\s*`?([a-zA-Z0-9_\-\.\/]+)`?\s*\n+```(\w*)\n([\s\S]*?)```/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match;
  
  let currentProject: CodeFile[] = [];
  
  while ((match = fileBlockRegex.exec(content)) !== null) {
    const matchIndex = match.index;
    const textBetween = content.substring(lastIndex, matchIndex).trim();
    
    if (textBetween) {
      if (currentProject.length > 0) {
        tokens.push({ type: 'project', files: currentProject });
        currentProject = [];
      }
      tokens.push({ type: 'text', content: textBetween });
    }
    
    currentProject.push({
      path: match[1].trim(),
      language: match[2].trim(),
      content: match[3],
    });
    
    lastIndex = fileBlockRegex.lastIndex;
  }
  
  if (currentProject.length > 0) {
    tokens.push({ type: 'project', files: currentProject });
  }
  
  const remainingText = content.substring(lastIndex).trim();
  if (remainingText) {
    tokens.push({ type: 'text', content: remainingText });
  }
  
  return tokens;
}

// Client-side regex-based high speed syntax highlighter
export function highlightCode(code: string, lang: string): string {
  if (!code) return "";
  
  let escaped = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const normalizedLang = (lang || "").toLowerCase();
  const isPython = normalizedLang === "python" || normalizedLang === "py";
  const isHtml = normalizedLang === "html" || normalizedLang === "xml";
  const isCss = normalizedLang === "css";
  const isSql = normalizedLang === "sql";
  const isJson = normalizedLang === "json";
  
  const commentRegex = isPython 
    ? /(#[^\n]*)/g 
    : /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g;
    
  const jsKeywords = /\b(const|let|var|function|return|import|export|from|default|class|extends|if|else|for|while|do|switch|case|break|continue|try|catch|finally|throw|new|this|typeof|instanceof|async|await|yield|interface|type|public|private|protected|readonly|implements|static|get|set|as|any|string|number|boolean|void|null|undefined|true|false)\b/g;
  const pyKeywords = /\b(def|class|return|import|from|as|if|elif|else|for|while|break|continue|try|except|finally|raise|assert|with|yield|lambda|global|nonlocal|True|False|None|and|or|not|in|is)\b/g;
  const sqlKeywords = /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|ALTER|DROP|INDEX|PRIMARY\s+KEY|FOREIGN\s+KEY|AND|OR|NOT|IN|LIKE|IS|NULL|AS|WITH|UNION|ALL|CASE|WHEN|THEN|ELSE|END)\b/gi;
  const htmlTags = /(&lt;\/?[a-zA-Z0-9:-]+(?:\s+[^&]*)?&gt;)/g;

  // Highlight strings (green)
  escaped = escaped.replace(/('(?:\\.|[^'])*'|"(?:\\.|[^"])*"|`(?:\\.|[^`])*`)/g, '<span style="color: #4ade80;">$1</span>');

  // Highlight keywords
  if (isHtml) {
    escaped = escaped.replace(htmlTags, '<span style="color: #60a5fa;">$1</span>');
  } else if (isCss) {
    escaped = escaped.replace(/([a-zA-Z-]+\s*:)/g, '<span style="color: #c084fc;">$1</span>');
  } else if (isSql) {
    escaped = escaped.replace(sqlKeywords, '<span style="color: #c084fc; font-weight: bold;">$1</span>');
  } else if (isPython) {
    escaped = escaped.replace(pyKeywords, '<span style="color: #c084fc;">$1</span>');
  } else if (isJson) {
    // Basic JSON key highlighting
    escaped = escaped.replace(/("[\w-]+"\s*:)/g, '<span style="color: #c084fc;">$1</span>');
  } else {
    escaped = escaped.replace(jsKeywords, '<span style="color: #c084fc;">$1</span>');
  }

  // Highlight comments (gray/italic)
  escaped = escaped.replace(commentRegex, '<span style="color: #71717a; font-style: italic;">$1</span>');

  return escaped;
}

// Beautiful single code block interface
function CodeBlock({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!className) {
    return <code className={className}>{children}</code>;
  }

  const highlightedHtml = highlightCode(code, language);

  return (
    <div className="relative group my-4 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
      <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50 no-print">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 rounded font-mono">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-green-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-400" />
          )}
        </button>
      </div>
      <div className="p-4 overflow-x-auto font-mono text-xs leading-relaxed text-zinc-300 bg-zinc-950/20 max-h-[400px]">
        <pre className="m-0 whitespace-pre">
          <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
        </pre>
      </div>
    </div>
  );
}

// Interactive Multi-file explorer component (ProjectExplorer)
export function ProjectExplorer({ files }: { files: CodeFile[] }) {
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  
  const currentFile = files[selectedFileIndex] || files[0];
  
  const handleCopy = async () => {
    if (!currentFile) return;
    await navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  const handleDownloadFile = () => {
    if (!currentFile) return;
    const blob = new Blob([currentFile.content], { type: 'text/plain;charset=utf-8' });
    const filename = currentFile.path.split('/').pop() || 'file.txt';
    saveAs(blob, filename);
  };
  
  const handleDownloadZip = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const zip = new JSZip();
      files.forEach(file => {
        zip.file(file.path, file.content);
      });
      zip.generateAsync({ type: 'blob' }).then(blob => {
        saveAs(blob, 'project-files.zip');
      });
    } catch (e) {
      console.error(e);
      alert('Failed to download ZIP');
    }
  };
  
  const highlightedHtml = currentFile ? highlightCode(currentFile.content, currentFile.language) : "";
  
  return (
    <div className="my-4 border border-zinc-800 rounded-xl overflow-hidden bg-zinc-900/40 flex flex-col md:flex-row h-[480px]">
      {/* File List Sidebar */}
      <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-950/30 flex flex-col flex-shrink-0 no-print">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50">
          <span className="text-[10px] font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
            <Folder className="w-3.5 h-3.5 text-purple-400" />
            Project Files ({files.length})
          </span>
          {files.length > 1 && (
            <button 
              onClick={handleDownloadZip}
              className="text-[10px] bg-purple-500/15 hover:bg-purple-500/30 text-purple-300 border border-purple-500/20 px-2 py-1 rounded-md transition-colors flex items-center gap-1 font-medium cursor-pointer"
            >
              <Download className="w-3 h-3" /> ZIP
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-0.5 max-h-[120px] md:max-h-none">
          {files.map((file, idx) => {
            const isSelected = idx === selectedFileIndex;
            return (
              <button
                key={idx}
                onClick={() => setSelectedFileIndex(idx)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left text-xs transition-colors ${isSelected ? 'bg-zinc-800 text-white font-medium border border-zinc-700/50' : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'}`}
              >
                <FileText className={`w-3.5 h-3.5 ${isSelected ? 'text-purple-400' : 'text-zinc-500'}`} />
                <span className="truncate">{file.path}</span>
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Code Viewer Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950/10">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between bg-zinc-950/50 no-print">
          <span className="text-xs font-mono text-zinc-300 truncate">
            {currentFile?.path}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 uppercase font-mono px-2 py-0.5 bg-zinc-900 border border-zinc-800 rounded">
              {currentFile?.language || 'text'}
            </span>
            <button 
              onClick={handleCopy}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Copy code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button 
              onClick={handleDownloadFile}
              className="p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-zinc-300 bg-zinc-950/40">
          <pre className="m-0 whitespace-pre">
            <code dangerouslySetInnerHTML={{ __html: highlightedHtml }} />
          </pre>
        </div>
      </div>
    </div>
  );
}

export default function MarkdownRenderer({ content, onOpenSettings }: MarkdownRendererProps) {
  if (!content) return null;
  
  const tokens = tokenizeContent(content);
  
  return (
    <div className="space-y-4">
      {tokens.map((token, idx) => {
        if (token.type === "project") {
          return <ProjectExplorer key={idx} files={token.files} />;
        }
        return (
          <ReactMarkdown
            key={idx}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeRaw, rehypeKatex]}
            components={{
              code({ className, children, ...props }) {
                const isBlock = className?.startsWith("language-");
                if (isBlock) {
                  return <CodeBlock className={className}>{children}</CodeBlock>;
                }
                return (
                  <code className={className} {...props}>
                    {children}
                  </code>
                );
              },
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              ...({
                "byok-trigger": () => {
                  return (
                    <div className="mt-4 p-5 bg-zinc-900 border border-purple-500/30 rounded-xl max-w-sm no-print">
                      <p className="mb-4 text-sm text-zinc-300">Unlock unlimited free access by generating your own API Key:</p>
                      <div className="flex flex-col gap-3">
                        <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700 transition-colors text-center border border-zinc-700">
                          1. Create Key (Free)
                        </a>
                        <button onClick={onOpenSettings} className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors text-center cursor-pointer">
                          2. Send API Key
                        </button>
                      </div>
                    </div>
                  );
                },
              } as any)
            }}
          >
            {token.content}
          </ReactMarkdown>
        );
      })}
    </div>
  );
}
