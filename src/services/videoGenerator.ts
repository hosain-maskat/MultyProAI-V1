import { GoogleGenAI } from "@google/genai";

export async function handleVideoGeneration(lastUserMessage: string, apiKey: string): Promise<string> {
  const genAI = new GoogleGenAI({ apiKey });
  
  const cleanQuery = lastUserMessage.replace(/^search /i, "").trim();
  
  let enhancedPrompt = cleanQuery;
  let isRealVideo = false;
  let youtubeSearchQuery = cleanQuery;

  try {
    // Step 1: Extract Intent using Gemini 2.5 Flash
    const titleResponse = await genAI.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Analyze this user request for a VIDEO: "${cleanQuery}". 
      If the MAIN subject is a REAL existing EVENT, PERSON, GAME, PLACE, or TUTORIAL (like 'Messi goal', 'how to cook pasta', 'Daffodil University'), you MUST return a YouTube search query for that (e.g., 'Messi best goals').
      HOWEVER, if the main subject is an IMAGINARY SCENE, ABSTRACT CONCEPT, or purely CREATIVE request (like 'a cinematic drone shot of a futuristic city', 'flying cars in cyberpunk city', 'a cat walking on Mars'), you MUST translate it to English (if it's in another language) and write a highly detailed, professional Text-to-Video generation prompt.
      If writing an enhanced prompt for AI generation, start your response exactly with: GENERATE_AI:`
    });
    
    let searchTerm = titleResponse.text?.trim() || "GENERATE_AI: " + cleanQuery;
    
    if (searchTerm.startsWith("GENERATE_AI:")) {
      enhancedPrompt = searchTerm.replace("GENERATE_AI:", "").trim();
      youtubeSearchQuery = enhancedPrompt; // Fallback query if AI fails
    } else {
      isRealVideo = true;
      youtubeSearchQuery = searchTerm;
    }
  } catch (searchError) {
    console.error("Gemini extraction failed, using raw query fallback:", searchError);
    // Basic heuristic if Gemini fails
    const isCreative = /create|generate|make|imagine/i.test(cleanQuery);
    if (isCreative) {
      enhancedPrompt = cleanQuery;
    } else {
      isRealVideo = true;
      youtubeSearchQuery = cleanQuery;
    }
  }

  const encodedYoutubeQuery = encodeURIComponent(youtubeSearchQuery);

  if (isRealVideo) {
    return `# 🎥 Video Result (YouTube)\n\nHere is the video you requested:\n\n<iframe class="w-full h-64 sm:h-96 rounded-xl mt-3 shadow-lg" src="/api/video?q=${encodedYoutubeQuery}" frameborder="0" allowfullscreen></iframe>\n\n[📥 Download Video](/api/video?q=${encodedYoutubeQuery}&download=true)\n\n*Note: This is a real video fetched directly from YouTube based on your prompt.*`;
  }
  // Step 2: Search Pixabay for high-quality stock videos matching the prompt
  try {
    const pixabayKey = process.env.PIXABAY_API_KEY || "56371408-83a054f4eefa49d4910b99fd6";
    const pixabayUrl = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(enhancedPrompt)}&per_page=3&safesearch=true`;
    
    const pixabayResponse = await fetch(pixabayUrl);
    
    if (!pixabayResponse.ok) {
      throw new Error("Pixabay API returned error: " + pixabayResponse.status);
    }

    const data = await pixabayResponse.json();
    
    if (data.hits && data.hits.length > 0) {
      // Get the best matching video
      const bestVideo = data.hits[0];
      // Prefer medium quality for fast loading, fallback to small or tiny
      const videoUrl = bestVideo.videos.medium?.url || bestVideo.videos.small?.url || bestVideo.videos.tiny?.url;
      const posterUrl = bestVideo.videos.medium?.thumbnail || "";
      
      return `# 🎥 Your Video is Ready!\n\nHere is a stunning, high-quality video that matches your prompt:\n\n<video controls class="w-full rounded-xl mt-3 shadow-lg" poster="${posterUrl}">\n  <source src="${videoUrl}" type="video/mp4">\n</video>\n\nWow, this looks amazing! I hope you like it. You can click the three dots on the player to download it.`;
    } else {
      // If no videos found for the specific prompt, try a more generic search using just the first keyword
      const firstKeyword = enhancedPrompt.split(' ')[0] || "nature";
      const fallbackUrl = `https://pixabay.com/api/videos/?key=${pixabayKey}&q=${encodeURIComponent(firstKeyword)}&per_page=3`;
      const fallbackRes = await fetch(fallbackUrl);
      const fallbackData = await fallbackRes.json();
      
      if (fallbackData.hits && fallbackData.hits.length > 0) {
        const bestVideo = fallbackData.hits[0];
        const videoUrl = bestVideo.videos.medium?.url || bestVideo.videos.small?.url || bestVideo.videos.tiny?.url;
        const posterUrl = bestVideo.videos.medium?.thumbnail || "";
        
        return `# 🎥 Your Video is Ready!\n\nI couldn't find an exact match, but here is a beautiful related video:\n\n<video controls class="w-full rounded-xl mt-3 shadow-lg" poster="${posterUrl}">\n  <source src="${videoUrl}" type="video/mp4">\n</video>\n\nWow, this looks amazing! I hope you like it. You can click the three dots on the player to download it.`;
      }
      
      return `# 🎥 Video Generation Failed\n\n> [!WARNING]\n> **No matches found:** I couldn't find any videos matching "${enhancedPrompt}". Try using simpler keywords!`;
    }
  } catch (error) {
    console.error("Pixabay Video Generation Failed:", error);
    return `# 🎥 Video Generation Failed\n\n> [!WARNING]\n> **Service Error:** The video search service is currently unavailable. Please try again later.`;
  }
}
