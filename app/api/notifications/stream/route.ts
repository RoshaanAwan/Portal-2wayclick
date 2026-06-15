import { requireUser } from "@/lib/auth";
import { subscribe, type LiveNotification } from "@/lib/notifications";

// Server-Sent Events stream for live notifications. The client opens this with
// an EventSource; whenever notify() fires for this user, we push the new
// notification down the wire and the bell updates without a refresh.
//
// Must stay dynamic and never be cached — it's an open connection, not a doc.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
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

      const onNotif = (n: LiveNotification) => send("notification", n);
      const unsubscribe = subscribe(user.id, onNotif);

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
