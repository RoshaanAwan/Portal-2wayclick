import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { MessagesClient } from "./MessagesClient";

// Server gate only — the real work (live list + thread) is client-side, fed by
// the MessagingProvider mounted in the (app) layout. We read ?c= on the client.
export default async function MessagesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <MessagesClient />;
}
