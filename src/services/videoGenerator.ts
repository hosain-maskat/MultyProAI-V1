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
    return `# 🎥 Video Result (YouTube)\n\nHere is the video you requested:\n\n<iframe width="100%" height="400" src="/api/video?q=${encodedYoutubeQuery}" frameborder="0" style="border-radius:10px; margin-top:10px;" allowfullscreen></iframe>\n\n[📥 Download Video](/api/video?q=${encodedYoutubeQuery}&download=true)\n\n*Note: This is a real video fetched directly from YouTube based on your prompt.*`;
  }

  // Step 2: Attempt Hugging Face Video Generation
  // Instead of fetching the 5MB video buffer here and crashing Vercel (4.5MB limit),
  // we return a markdown video tag that points to our Edge proxy route.
  // The Edge route will stream the video directly to the client.
  
  const proxyUrl = `/api/proxy-video?prompt=${encodeURIComponent(enhancedPrompt)}`;
  
  return `# 🎥 AI Video Generation Started\n\nYour AI video is being generated based on your prompt. It may take 15-30 seconds to load.\n\n<video controls style="width: 100%; border-radius: 10px; margin-top: 10px;" poster="https://i.imgur.com/3V2Xb3f.gif">\n  <source src="${proxyUrl}" type="video/mp4">\n  Your browser does not support the video tag.\n</video>\n\n[📥 Download AI Video](${proxyUrl}&download=true)\n\n*Note: Generated using Hugging Face Text-to-Video API.*`;
}
