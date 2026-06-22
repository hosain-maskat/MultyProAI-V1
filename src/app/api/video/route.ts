import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "nature";
  const download = searchParams.get("download") === "true";
  
  try {
    // We use DuckDuckGo HTML search to find the YouTube video. 
    // This is much more stable on Vercel than yt-search which crashes the server.
    const searchUrl = `https://html.duckduckgo.com/html/?q=site:youtube.com+${encodeURIComponent(q)}`;
    const response = await fetch(searchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    if (!response.ok) {
      throw new Error("Search failed");
    }
    
    const html = await response.text();
    // Extract the first YouTube video ID from the search results
    const match = html.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);
    
    if (match && match[1]) {
      const videoId = match[1];
      
      if (download) {
        return NextResponse.redirect(`https://ssyoutube.com/watch?v=${videoId}`);
      } else {
        return NextResponse.redirect(`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0`);
      }
    } else {
      // Fallback if no video found
      return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  } catch (error) {
    console.error("Video API Error:", error);
    if (download) {
      return NextResponse.redirect(`https://ssyoutube.com/watch?v=dQw4w9WgXcQ`);
    }
    return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
  }
}
