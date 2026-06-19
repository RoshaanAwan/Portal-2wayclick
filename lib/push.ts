import "server-only";
import webpush from "web-push";
import { db } from "./db";

// ── Web Push delivery ─────────────────────────────────────────────────────────
// Sends OS-level push notifications to a user's subscribed devices, even when the
// app/tab is closed. Pairs with the in-app SSE bell (lib/notifications.ts): every
// notify() persists a row, pushes to open SSE streams, AND fans out here.
//
// Best-effort and never throws — a failed push must not break the action that
// triggered the notification. Dead subscriptions (404/410 from the push service)
// are pruned so we stop trying to reach them.

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || "mailto:admin@2wayclick.com";

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

/** Whether Web Push is configured on this server (VAPID keys present). */
export function isPushConfigured(): boolean {
  return !!publicKey && !!privateKey;
}

export interface PushPayload {
  title: string;
  body: string;
  /** In-app deep link opened when the notification is clicked. */
  url?: string;
  /** Tag to collapse/replace prior notifications of the same kind. */
  tag?: string;
}

/**
 * Send a push to every device the user has subscribed. Prunes any subscription
 * the push service reports as gone. Never throws.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<void> {
  if (!ensureConfigured()) return;

  try {
    const subs = await db.pushSubscription.findMany({ where: { userId } });
    if (subs.length === 0) return;

    const body = JSON.stringify(payload);
    const staleIds: string[] = [];

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
          );
        } catch (err: unknown) {
          const status =
            typeof err === "object" && err !== null && "statusCode" in err
              ? (err as { statusCode?: number }).statusCode
              : undefined;
          // 404/410 mean the subscription is gone — drop it. Other errors are
          // transient (network, push service hiccup) — keep the subscription.
          if (status === 404 || status === 410) {
            staleIds.push(sub.id);
          } else {
            console.error("[push] send failed", status ?? err);
          }
        }
      }),
    );

    if (staleIds.length > 0) {
      await db.pushSubscription.deleteMany({ where: { id: { in: staleIds } } });
    }
  } catch (err) {
    console.error("[push] sendPushToUser failed", err);
  }
}
