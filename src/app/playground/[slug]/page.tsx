"use client";

import { useParams } from "next/navigation";
import { use } from "react";
import { getTool } from "@/lib/tools";
import GeminiChat from "@/components/GeminiChat";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function PlaygroundPage() {
  const params = useParams();
  const slug = params.slug as string;
  const tool = getTool(slug);

  if (!tool) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center text-center px-4">
        <div className="text-6xl mb-6">🔍</div>
        <h1 className="text-2xl font-bold text-white mb-3">Tool Not Found</h1>
        <p className="text-zinc-500 mb-8 max-w-md">
          The tool you&apos;re looking for doesn&apos;t exist. It may have been removed or
          the URL might be incorrect.
        </p>
        <Link
          href="/"
          className="flex items-center gap-2 px-5 py-2.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-xl hover:bg-purple-500/30 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Tools
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-zinc-950 overflow-hidden">
      <GeminiChat tool={tool} />
    </div>
  );
}
