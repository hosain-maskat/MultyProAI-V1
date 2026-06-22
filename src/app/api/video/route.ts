import { NextRequest, NextResponse } from "next/server";
import ytSearch from "yt-search";
import { timeout } from "promise-timeout";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "nature";
  const download = searchParams.get("download") === "true";
  
  try {
    // Add a 5 second timeout to ytSearch to prevent Vercel crashes
    const r = await timeout(ytSearch(q), 5000);
    const videos = r.videos;
    
    if (videos && videos.length > 0) {
      const video = videos[0];
      const videoId = video.videoId;
      
      if (download) {
        // Redirecting to ssyoutube.com for an easier 1-click download experience.
        return NextResponse.redirect(`https://ssyoutube.com/watch?v=${videoId}`);
      } else {
        // Return the YouTube embed URL
        return NextResponse.redirect(`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0`);
      }
    } else {
      return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  } catch (error) {
    console.error("YouTube API Error:", error);
    // If it fails or times out, fallback to a placeholder so the iframe doesn't crash
    if (download) {
      return NextResponse.redirect(`https://ssyoutube.com/watch?v=dQw4w9WgXcQ`);
    }
    return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
  }
}
