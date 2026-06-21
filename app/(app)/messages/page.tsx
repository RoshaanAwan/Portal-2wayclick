import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CHAT_ENABLED } from "@/lib/features";
import { MessagesClient } from "./MessagesClient";

// Server gate only — the real work (live list + thread) is client-side, fed by
// the MessagingProvider mounted in the (app) layout. We read ?c= on the client.
export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Chat is feature-flagged (lib/features.ts). While off, the MessagingProvider
  // isn't mounted, so MessagesClient's useMessaging() would throw — redirect any
  // stray /messages URL to the dashboard instead.
  if (!CHAT_ENABLED) redirect("/dashboard");
  return <MessagesClient />;
}
