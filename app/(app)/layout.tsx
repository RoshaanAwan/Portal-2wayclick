import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { AssistantWidgetLazy } from "@/components/AssistantWidgetLazy";
import { MobileNavProvider } from "@/components/MobileNavProvider";
import { MessagingProvider } from "@/components/MessagingProvider";
import { CHAT_ENABLED } from "@/lib/features";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The topbar bell loads the user's own notifications (and subscribes to a live
  // SSE stream) client-side — see components/Topbar.tsx.
  const shell = (
    <div className="min-h-screen">
      <Sidebar role={user.role} />
      <div className="lg:pl-64">
        <Topbar user={user} />
        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
      {/* Floating AI assistant (bottom-right) — answers from scoped portal data.
          Lazy-loaded so its JS stays off every page's critical hydration path. */}
      <AssistantWidgetLazy />
    </div>
  );

  return (
    <MobileNavProvider>
      {/* MessagingProvider owns the single chat SSE/poll stream + conversation
          list, so both the Sidebar (unread badge) and the /messages page read one
          source. Mounted only when chat is enabled (lib/features.ts CHAT_ENABLED)
          — while off, its polling loop never runs and nothing chat-related loads. */}
      {CHAT_ENABLED ? (
        <MessagingProvider
          me={{ id: user.id, name: user.name, avatarUrl: user.avatarUrl }}
        >
          {shell}
        </MessagingProvider>
      ) : (
        shell
      )}
    </MobileNavProvider>
  );
}
