import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { membershipOf, sendMessage } from "@/lib/messaging";

// Send a message to a conversation. Requires membership. Persists the message,
// bumps the conversation, publishes it live to every member's chat stream, and
// fires bell + Web Push notifications to the others (see lib/messaging.ts).
// Returns the server id + timestamp so the sender reconciles its optimistic row.
const schema = z.object({
  conversationId: z.string().min(1),
  body: z.string().trim().min(1).max(4000),
  // Optional optimistic temp id, echoed back over the live stream so the
  // sender's own tab replaces its placeholder instead of duplicating it.
  clientId: z.string().min(1).max(64).optional(),
});

export async function POST(req: Request) {
  try {
    const me = await requireTenantUser();
    const { conversationId, body, clientId } = schema.parse(await req.json());

    const member = await membershipOf(conversationId, me.id);
    if (!member)
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const result = await sendMessage({
      conversationId,
      sender: { id: me.id, name: me.name, avatarUrl: me.avatarUrl },
      body,
      clientId,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
