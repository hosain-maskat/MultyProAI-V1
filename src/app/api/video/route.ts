import { NextRequest, NextResponse } from "next/server";
import ytSearch from "youtube-search-api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") || "nature";
  const download = searchParams.get("download") === "true";
  
  try {
    // Use youtube-search-api to get exact YouTube results, handling typos natively.
    const result = await ytSearch.GetListByKeyword(q, false, 1);
    
    if (result && result.items && result.items.length > 0) {
      // Filter to ensure we only get videos, not channels or playlists
      const video = result.items.find((item: any) => item.type === "video") || result.items[0];
      const videoId = video.id;
      
      if (videoId) {
        if (download) {
          return NextResponse.redirect(`https://ssyoutube.com/watch?v=${videoId}`);
        } else {
          return NextResponse.redirect(`https://www.youtube.com/embed/${videoId}?autoplay=0&controls=1&rel=0`);
        }
      }
    }
    
    // Fallback if no video found
    return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
  } catch (error) {
    console.error("Video API Error:", error);
    if (download) {
      return NextResponse.redirect(`https://ssyoutube.com/watch?v=dQw4w9WgXcQ`);
    }
    return NextResponse.redirect("https://www.youtube.com/embed/dQw4w9WgXcQ");
  }
}
