import { db } from "@/db";
import { conversations, messages } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const toolSlug = req.nextUrl.searchParams.get("toolSlug");

  try {
    if (toolSlug) {
      const result = await db
        .select()
        .from(conversations)
        .where(eq(conversations.toolSlug, toolSlug))
        .orderBy(desc(conversations.updatedAt))
        .limit(50);
      return Response.json(result);
    }

    const result = await db
      .select()
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .limit(50);
    return Response.json(result);
  } catch {
    return Response.json([], { status: 200 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { toolSlug, title } = body;

  try {
    const result = await db
      .insert(conversations)
      .values({
        toolSlug,
        title: title || "New Conversation",
      })
      .returning();
    return Response.json(result[0], { status: 201 });
  } catch (e) {
    return Response.json({ error: "Failed to create conversation" }, { status: 500 });
  }
}
