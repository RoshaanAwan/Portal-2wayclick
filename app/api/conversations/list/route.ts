import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listConversationsFor } from "@/lib/messaging";

// All of the caller's conversations, newest-activity first, each with its last
// message and the caller's unread count, plus the total-unread for the sidebar
// badge. The client seeds MessagingProvider from this and then keeps it live
// over the chat SSE stream.
export async function GET() {
  try {
    const user = await requireUser();
    const data = await listConversationsFor(user.id);
    return NextResponse.json(data);
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
