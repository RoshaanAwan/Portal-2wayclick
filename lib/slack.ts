import "server-only";

// ── Outbound Slack messaging ────────────────────────────────────────────────────
// Sends a direct message FROM the portal's Slack bot TO a user, using their
// stored slackUserId (User.slackUserId — the same column the inbound attendance
// webhook attributes check-ins by; see app/api/attendance/slack/route.ts).
//
// This is the OUTBOUND counterpart to that inbound webhook: the portal calls
// Slack's Web API (chat.postMessage) directly. Slack opens a DM channel with the
// target user automatically when you post to their user ID as the channel.
//
// Best-effort and never throws — mirrors lib/push.ts and lib/notifications.ts. A
// failed Slack DM must never break the action that triggered it (task assignment,
// task creation, …). When the bot token or the user's slackUserId is missing it
// quietly no-ops, so the feature is fully optional / env-gated.
//
// Setup: create a Slack app installed to the workspace with the `chat:write` bot
// scope, then set SLACK_BOT_TOKEN (the `xoxb-…` bot token) in the environment.

/** Whether outbound Slack messaging is configured on this server. Read live (not
 *  captured at module load) so dev/HMR picks up a token added after first import. */
export function isSlackConfigured(): boolean {
  return !!process.env.SLACK_BOT_TOKEN;
}

/**
 * Send a direct message to one Slack user by their Slack user ID (e.g.
 * "U012ABCDEF"). No-ops when Slack isn't configured or no slackUserId is given.
 * Never throws.
 *
 * @param slackUserId The recipient's Slack user ID (User.slackUserId).
 * @param text        Message text. Supports Slack mrkdwn (*bold*, <url|label>).
 */
export async function sendSlackDM(
  slackUserId: string | null | undefined,
  text: string,
): Promise<void> {
  // Read the token live (not at module load) so dev picks it up after restart.
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) {
    console.warn("[slack] skipped DM: SLACK_BOT_TOKEN not set");
    return;
  }
  if (!slackUserId) {
    console.warn("[slack] skipped DM: recipient has no linked slackUserId");
    return;
  }

  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Authorization: `Bearer ${token}`,
      },
      // Posting to a user ID as `channel` tells Slack to open/use the bot↔user DM.
      body: JSON.stringify({ channel: slackUserId, text }),
    });

    // Slack always returns HTTP 200; success/failure is in the JSON `ok` flag.
    const data: { ok?: boolean; error?: string } = await res
      .json()
      .catch(() => ({}));
    if (data.ok) {
      console.log(`[slack] DM sent to ${slackUserId}`);
    } else {
      console.error("[slack] chat.postMessage failed", data.error ?? res.status);
    }
  } catch (err) {
    console.error("[slack] sendSlackDM failed", err);
  }
}
