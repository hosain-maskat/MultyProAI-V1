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
  try {
    // We attempt to call Hugging Face Inference API for Video Generation.
    // NOTE: Free tier video endpoints on HF are highly unstable, often returning 503 or "Model is too large".
    // If it fails, we catch the error and fallback to YouTube.
    
    // Using a placeholder fetch to a common open video model (which usually requires a token or Pro tier).
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b",
      {
        headers: {
          "Content-Type": "application/json",
          ...(process.env.HF_TOKEN && { "Authorization": `Bearer ${process.env.HF_TOKEN}` })
        },
        method: "POST",
        body: JSON.stringify({ inputs: enhancedPrompt }),
      }
    );

    if (hfResponse.ok) {
      const blob = await hfResponse.blob();
      // Normally we would save this blob or convert to base64. 
      // Because serverless memory is limited, we simulate the success if it somehow works.
      const buffer = Buffer.from(await blob.arrayBuffer());
      const base64Video = buffer.toString('base64');
      return `# 🎥 AI Video Generation Complete\n\nHere is the AI-generated video based on your prompt:\n\n<video controls style="width: 100%; border-radius: 10px; margin-top: 10px;"><source src="data:video/mp4;base64,${base64Video}" type="video/mp4"></video>\n\n*Note: Generated using Hugging Face Text-to-Video API.*`;
    } else {
      throw new Error("Hugging Face API returned error: " + hfResponse.status);
    }
  } catch (error) {
    console.error("Hugging Face Video Generation Failed, falling back to YouTube:", error);
    
    // Step 3: Fallback to YouTube
    return `# 🎥 Video Result (AI Fallback)\n\n> [!WARNING]\n> **AI Video Generation Failed:** The Hugging Face server is currently overloaded or out of free quota. Falling back to the closest matching YouTube video.\n\nHere is the best matching video found for: "${enhancedPrompt}"\n\n<iframe width="100%" height="400" src="/api/video?q=${encodedYoutubeQuery}" frameborder="0" style="border-radius:10px; margin-top:10px;" allowfullscreen></iframe>\n\n[📥 Download Video](/api/video?q=${encodedYoutubeQuery}&download=true)\n\n*Note: Fallback successful. Video sourced from YouTube.*`;
  }
}
