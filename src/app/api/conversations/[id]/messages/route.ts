import { db } from "@/db";
import { messages, conversations } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversationId = parseInt(id, 10);

  if (isNaN(conversationId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const result = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt));
    return Response.json(result);
  } catch {
    return Response.json([], { status: 200 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const conversationId = parseInt(id, 10);
  const body = await req.json();
  const { role, content } = body;

  if (isNaN(conversationId)) {
    return Response.json({ error: "Invalid ID" }, { status: 400 });
  }

  try {
    const result = await db
      .insert(messages)
      .values({
        conversationId,
        role,
        content,
      })
      .returning();

    // Update conversation updated_at
    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    return Response.json(result[0], { status: 201 });
  } catch (e) {
    return Response.json({ error: "Failed to save message" }, { status: 500 });
  }
}
