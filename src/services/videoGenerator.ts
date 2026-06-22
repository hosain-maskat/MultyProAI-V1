import { GoogleGenAI } from "@google/genai";

export async function handleVideoGeneration(lastUserMessage: string, apiKey: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey });
  const cleanQuery = lastUserMessage.replace(/^search /i, "").trim();
  
  let searchKeywords = cleanQuery;

  try {
    // Extract main visual keywords for Pixabay search
    const keywordResponse = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract the 2 or 3 most important visual keywords from this video prompt to use in a stock video search engine. Return ONLY the keywords separated by spaces, nothing else. Example: "snow mountain sunset". Prompt: "${cleanQuery}"`
    });
    
    if (keywordResponse.text) {
      searchKeywords = keywordResponse.text.trim();
    }
  } catch (error) {
    console.error("Keyword extraction failed, using raw query:", error);
  }

  try {
    const pixabayKey = process.env.PIXABAY_API_KEY || "56371408-83a054f4eefa49d4910b99fd6";
    const pixabayUrl = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(searchKeywords)}&per_page=3&safesearch=true`;
    
    const pixabayResponse = await fetch(pixabayUrl);
    
    if (!pixabayResponse.ok) {
      throw new Error("Pixabay API returned error: " + pixabayResponse.status);
    }

    const data = await pixabayResponse.json();
    
    if (data.hits && data.hits.length > 0) {
      const bestVideo = data.hits[0];
      const videoUrl = bestVideo.videos.medium?.url || bestVideo.videos.small?.url || bestVideo.videos.tiny?.url;
      const posterUrl = bestVideo.videos.medium?.thumbnail || "";
      
      return `# 🎥 Your Video is Ready!\n\nHere is a stunning, high-quality video for your search:\n\n<video controls class="w-full rounded-xl mt-3 shadow-lg" poster="${posterUrl}">\n  <source src="${videoUrl}" type="video/mp4">\n</video>\n\nWow, this looks amazing! You can play it directly here, and click the three dots on the player to download it.`;
    } else {
      // Fallback search with just the first keyword
      const firstKeyword = searchKeywords.split(' ')[0] || "nature";
      const fallbackUrl = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(firstKeyword)}&per_page=3`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      
      if (fallbackData.hits && fallbackData.hits.length > 0) {
        const bestVideo = fallbackData.hits[0];
        const videoUrl = bestVideo.videos.medium?.url || bestVideo.videos.small?.url || bestVideo.videos.tiny?.url;
        const posterUrl = bestVideo.videos.medium?.thumbnail || "";
        
        return `# 🎥 Your Video is Ready!\n\nI couldn't find an exact match, but here is a related video:\n\n<video controls class="w-full rounded-xl mt-3 shadow-lg" poster="${posterUrl}">\n  <source src="${videoUrl}" type="video/mp4">\n</video>\n\nWow, this looks amazing! You can play it directly here, and click the three dots on the player to download it.`;
      }
      
      return `# 🎥 Video Generation Failed\n\n> [!WARNING]\n> **No matches found:** I couldn't find any videos matching "${cleanQuery}". Try using simpler keywords!`;
    }
  } catch (error) {
    console.error("Pixabay Video Generation Failed:", error);
    return `# 🎥 Video Generation Failed\n\n> [!WARNING]\n> **Service Error:** The video search service is currently unavailable. Please try again later.`;
  }
}
