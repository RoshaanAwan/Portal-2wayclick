import { requireUser } from "@/lib/auth";
import { subscribeActivity, type LiveActivity } from "@/lib/notifications";

// Server-Sent Events stream for the company-wide Live Activity Wall. Any signed-in
// user opens this with an EventSource; whenever recordActivity() fires anywhere
// in the app, the new entry is pushed down the wire and the dashboard wall
// animates it in — no refresh. Mirrors /api/notifications/stream, but the channel
// is shared (everyone sees the same public pulse) rather than per-user.
//
// Must stay dynamic and never be cached — it's an open connection, not a doc.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  // Auth-gate the stream — the wall is for signed-in staff only — but every
  // subscriber receives the same company-wide feed.
  const user = await requireUser().catch(() => null);
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // Controller already closed — ignore.
        }
      };

      // Open the stream so the client's onopen fires promptly.
      send("ready", { ok: true });

      const onActivity = (a: LiveActivity) => send("activity", a);
      const unsubscribe = subscribeActivity(onActivity);

      // Heartbeat: a comment line every 25s keeps proxies/load balancers from
      // dropping an otherwise-idle connection.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          // ignore
        }
      }, 25_000);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Tear down when the client disconnects (tab close, navigation).
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
