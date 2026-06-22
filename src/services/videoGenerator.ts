export async function handleVideoGeneration(lastUserMessage: string, _apiKey: string): Promise<string> {
  const cleanQuery = lastUserMessage.replace(/^search /i, "").trim();
  
  try {
    const encodedYoutubeQuery = encodeURIComponent(cleanQuery);
    
    return `# 🎥 Video Result\n\nHere is the video you requested from YouTube:\n\n<iframe class="w-full h-64 sm:h-96 rounded-xl mt-3 shadow-lg" src="/api/video?q=${encodedYoutubeQuery}" frameborder="0" allowfullscreen></iframe>\n\n[📥 Download Video (MP4)](/api/video?q=${encodedYoutubeQuery}&download=true)\n\n*Note: This video is fetched directly from YouTube based on your text prompt. Click the download button to save it locally.*`;
  } catch (error) {
    console.error("Video Search Failed:", error);
    return `# 🎥 Video Search Failed\n\n> [!WARNING]\n> **Error:** Could not process the video search. Please try again.`;
  }
}
