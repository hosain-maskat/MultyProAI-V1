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
  // Step 2: Attempt Hugging Face Video Generation
  try {
    if (!process.env.HF_TOKEN) {
      return `# ⚠️ Hugging Face Token Missing\n\nTo use the AI Video Generator globally, you need to add your free Hugging Face API token to Vercel.\n\n**How to fix this:**\n1. Go to [Hugging Face Tokens](https://huggingface.co/settings/tokens) and create a free Access Token (Read).\n2. Go to your Vercel Project > Settings > Environment Variables.\n3. Add a new variable: Key = \`HF_TOKEN\`, Value = \`your_token_here\`.\n4. Click **Redeploy** on Vercel.\n\n*The video generator will work perfectly once this is added!*`;
    }

    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b",
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.HF_TOKEN}`
        },
        method: "POST",
        body: JSON.stringify({ inputs: enhancedPrompt }),
      }
    );

    if (hfResponse.ok) {
      const blob = await hfResponse.blob();
      const buffer = Buffer.from(await blob.arrayBuffer());
      const base64Video = buffer.toString('base64');
      
      return `# 🎥 Your AI Video is Ready!\n\nHere is the stunning AI-generated video created specifically for your prompt:\n\n<video controls class="w-full rounded-xl mt-3 shadow-lg">\n  <source src="data:video/mp4;base64,${base64Video}" type="video/mp4">\n</video>\n\nWow, this looks amazing! I hope you like it. You can click the three dots on the player to download it.`;
    } else {
      const errorText = await hfResponse.text();
      console.error("HF Error:", errorText);
      throw new Error(`Hugging Face API returned error: ${hfResponse.status} - ${errorText}`);
    }
  } catch (error) {
    console.error("Hugging Face Video Generation Failed:", error);
    
    // Instead of falling back to YouTube (which crashes on Vercel), show a clean error message.
    return `# 🎥 AI Video Generation Failed\n\n> [!WARNING]\n> **Server Overloaded:** The Hugging Face server is currently busy or warming up. Please try again in a few minutes!\n\n*Technical Details: The free Hugging Face AI model takes some time to wake up. Please click generate again after 1 minute.*`;
  }
}
