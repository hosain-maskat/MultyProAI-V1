import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }
  
  // In a real production app, you should NOT send the API key to the client.
  // Instead, proxy the WebSocket connection or use OAuth.
  // We send it here to allow direct WebSocket connection from browser for performance.
  return NextResponse.json({ apiKey });
}
