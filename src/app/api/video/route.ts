import { NextRequest, NextResponse } from "next/server";
import ytSearch from "yt-search";
import ytdl from "@distube/ytdl-core";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "nature";
  const download = searchParams.get("download") === "true";
  
  try {
    const r = await ytSearch(q);
    const videos = r.videos;
    
    if (videos && videos.length > 0) {
      const video = videos[0];
      const videoId = video.videoId;
      
      if (download) {
        // ytdl-core is currently failing due to YouTube cipher updates.
        // Redirecting to ssyoutube.com for an easier 1-click download experience.
        return NextResponse.redirect(`https://ssyoutube.com/watch?v=${videoId}`);
      } else {
        // Return the YouTube embed URL
        return NextResponse.redirect(`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0`);
      }
    } else {
      // Fallback rickroll if nothing found
      return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
    }
  } catch (error) {
    console.error("YouTube API Error:", error);
    return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
  }
}
