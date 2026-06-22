import { NextRequest } from "next/server";

export const runtime = 'edge';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const prompt = searchParams.get("prompt");

  if (!prompt) {
    return new Response("Missing prompt", { status: 400 });
  }

  try {
    const hfResponse = await fetch(
      "https://api-inference.huggingface.co/models/damo-vilab/text-to-video-ms-1.7b",
      {
        headers: {
          "Content-Type": "application/json",
          ...(process.env.HF_TOKEN && { "Authorization": `Bearer ${process.env.HF_TOKEN}` })
        },
        method: "POST",
        body: JSON.stringify({ inputs: prompt }),
      }
    );

    if (!hfResponse.ok) {
      return new Response("Hugging Face API returned error: " + hfResponse.status, { status: hfResponse.status });
    }

    // Proxy the video stream directly to bypass Vercel 4.5MB limit
    return new Response(hfResponse.body, {
      headers: {
        "Content-Type": "video/mp4",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Disposition": `attachment; filename="ai-video-${Date.now()}.mp4"`
      }
    });

  } catch (error: any) {
    return new Response(error.message, { status: 500 });
  }
}
