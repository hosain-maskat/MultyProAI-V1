"use client";

import Link from "next/link";
import { useState } from "react";
import { tools, categories, getToolsByCategory } from "@/lib/tools";
import { Search, Sparkles, Zap, ArrowRight, Star, MessageSquarePlus } from "lucide-react";
import FeedbackModal from "@/components/FeedbackModal";

export default function Home() {
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);

  const filteredTools = getToolsByCategory(selectedCategory).filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Hero Section */}
      <header className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-900/20 via-zinc-950 to-blue-900/20" />
        <div 
          className="absolute inset-0 opacity-10 bg-center bg-no-repeat"
          style={{ backgroundImage: "url('https://upload.wikimedia.org/wikipedia/en/thumb/6/69/Daffodil_International_University_logo.svg/1200px-Daffodil_International_University_logo.svg.png')", backgroundSize: "50%" }} 
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-16">
          {/* Nav */}
          <nav className="fixed top-0 inset-x-0 z-50 bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-800/50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">Daffodil Inteligence</span>
              </div>
              <div className="hidden md:flex items-center gap-6 text-sm text-zinc-400">
                <span className="text-zinc-200 font-medium">Tools</span>
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    document.getElementById('categories')?.scrollIntoView({ behavior: 'smooth' });
                  }} 
                  className="hover:text-white transition-colors cursor-pointer"
                >
                  Categories
                </button>
              </div>
              <button 
                onClick={() => setIsFeedbackModalOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 rounded-full hover:bg-purple-500/20 transition-colors ml-4 md:ml-0"
              >
                <MessageSquarePlus className="w-4 h-4" />
                Feedback
              </button>
            </div>
          </nav>

          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto mt-24">
            <div className="inline-flex items-center gap-2 bg-zinc-900/80 border border-zinc-800 rounded-full px-4 py-1.5 mb-6 text-sm text-zinc-400">
              <Zap className="w-3.5 h-3.5 text-yellow-500" />
              <span>20+ Specialized AI Tools</span>
              <Star className="w-3.5 h-3.5 text-yellow-500" />
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6">
              <span className="text-white">Next-Gen </span>
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-blue-400 bg-clip-text text-transparent">
                Generative AI
              </span>
              <br />
              <span className="text-white">Platform</span>
            </h1>

            <p className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Research papers, code generation, creative writing, business plans,
              data analysis, and more — all powered by advanced AI models in one
              unified platform.
            </p>

            {/* Personal Assistant Hero Button */}
            <div className="mb-12">
              <Link href="/playground/omni-ai">
                <button className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold rounded-2xl text-lg shadow-lg shadow-purple-500/25 transition-all transform hover:scale-105 flex items-center justify-center mx-auto gap-3">
                  <Sparkles className="w-6 h-6" />
                  Chat with Personal AI
                </button>
              </Link>
              <p className="text-zinc-500 text-sm mt-3">The ultimate all-in-one assistant. Does everything.</p>
            </div>

            {/* Search Bar */}
            <div className="max-w-xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tools..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-zinc-900/80 border border-zinc-800 rounded-2xl text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/20 transition-all text-lg"
              />
            </div>
          </div>
        </div>
      </header>

      {/* Categories */}
      <section id="categories" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                  : "bg-zinc-900/50 text-zinc-400 border border-zinc-800 hover:border-zinc-700 hover:text-zinc-300"
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Tools Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">
            {selectedCategory === "all"
              ? "All Tools"
              : categories.find((c) => c.id === selectedCategory)?.name}{" "}
            <span className="text-zinc-500 font-normal">
              ({filteredTools.length})
            </span>
          </h2>
        </div>

        {filteredTools.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-zinc-500 text-lg">No tools found matching your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredTools.map((tool) => (
              <Link key={tool.id} href={`/playground/${tool.slug}`}>
                <div className="group relative bg-zinc-900/50 border border-zinc-800 rounded-2xl p-5 hover:border-purple-500/40 hover:bg-zinc-900/80 transition-all duration-300 h-full flex flex-col">
                  {/* Icon */}
                  <div className="text-4xl mb-4">{tool.icon}</div>

                  {/* Content */}
                  <h3 className="text-base font-semibold text-white mb-1.5 group-hover:text-purple-300 transition-colors">
                    {tool.name}
                  </h3>
                  <p className="text-sm text-zinc-500 mb-4 flex-grow leading-relaxed">
                    {tool.description}
                  </p>

                  {/* Footer */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs uppercase tracking-widest text-purple-400/70 font-medium">
                      {tool.category}
                    </span>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-purple-400 group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
              <span className="text-white font-bold text-xs">M</span>
            </div>
            <span className="text-sm font-semibold text-zinc-400">
              Daffodil Inteligence
            </span>
          </div>
          <p className="text-sm text-zinc-600">
            © 2026 Daffodil Inteligence. All rights reserved.
          </p>
        </div>
      </footer>

      <FeedbackModal 
        isOpen={isFeedbackModalOpen} 
        onClose={() => setIsFeedbackModalOpen(false)} 
      />
    </div>
  );
}
