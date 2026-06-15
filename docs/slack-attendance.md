# Slack attendance integration

How Slack check-in / check-out events flow into the portal's attendance records.

## The flow

```
 ┌──────────────┐   "check in" / "check out"   ┌──────────────────┐
 │  Slack user  │ ───────────────────────────► │   #attendance    │
 └──────────────┘        (channel message)     │     channel      │
                                                └────────┬─────────┘
                                                         │  message event
                                                         ▼
                                          ┌──────────────────────────┐
                                          │  Local Slack bot (yours)  │
                                          │  detects "check in/out"   │
                                          └────────────┬──────────────┘
                                                       │ HTTPS POST + Bearer secret
                                                       ▼
                                  ┌───────────────────────────────────────┐
                                  │  Portal: POST /api/attendance/slack     │
                                  │  • verify SLACK_BOT_SECRET              │
                                  │  • resolve Slack user → portal User     │
                                  │  • upsert Attendance row for the day    │
                                  └───────────────────────────────────────┘
```

The portal does **not** talk to Slack directly. Your local bot is the only thing
that calls the portal, so the only secret the portal needs is `SLACK_BOT_SECRET`.

## What the bot must POST

`POST https://<your-portal-domain>/api/attendance/slack`

Headers:

```
Authorization: Bearer <SLACK_BOT_SECRET>
Content-Type: application/json
```

Body:

```jsonc
{
  "action": "check_in",            // or "check_out" — REQUIRED
  "slackUserId": "U012ABCDEF",     // preferred — Slack's stable user id
  "email": "raza@onestop.software",// fallback if slackUserId isn't linked yet
  "handle": "raza",                // optional, display only
  "timestamp": "1718445120.000200" // optional; Slack ts (epoch s) or ISO. Defaults to now
}
```

Provide **either** `slackUserId` or `email` (both is best). The portal resolves
the person by `slackUserId` first, then by `email`. On the first event it links
the Slack id/handle onto the matching `User` row, so later events resolve by id.

### Responses

| Status | Meaning | Bot should |
| --- | --- | --- |
| `200` | Recorded. Body has `status` (`PRESENT`/`CHECKED_OUT`) and `day`. | nothing / log |
| `202` | Accepted but **no matching portal user** (`reason: "no_matching_user"`). | not retry; tell an admin to link this Slack user |
| `400` | Bad payload. | fix and not retry |
| `401` | Wrong/missing secret. | check `SLACK_BOT_SECRET` |

## Mapping Slack users to portal users

- **Easiest:** make sure each person's Slack profile email matches their portal
  `User.email`. Then send `email` and you're done.
- **Most robust:** store the Slack user id on the portal `User` (`slackUserId`
  column, now in the schema). The first event with both `email` and `slackUserId`
  links them automatically; afterwards id alone is enough even if the email
  differs. An admin can also set it directly in the DB.

## Example bot (Slack Bolt for JS)

Your bot already detects "check in" in a channel (per the screenshot). Minimal
forwarder:

```js
const { App } = require("@slack/bolt");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN, // Socket Mode
  socketMode: true,
});

const PORTAL_URL = process.env.PORTAL_URL;          // https://portal.example.com
const SECRET = process.env.SLACK_BOT_SECRET;         // same as portal's

async function forward(action, event) {
  const info = await app.client.users.info({ user: event.user });
  await fetch(`${PORTAL_URL}/api/attendance/slack`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      slackUserId: event.user,
      email: info.user?.profile?.email,
      handle: info.user?.name,
      timestamp: event.ts,            // Slack epoch-seconds string
    }),
  });
}

// React to plain channel messages "check in" / "check out".
app.message(/^check\s*in$/i, async ({ message }) => forward("check_in", message));
app.message(/^check\s*out$/i, async ({ message }) => forward("check_out", message));

app.start().then(() => console.log("attendance bot up"));
```

> The bot needs the `users:read` and `users:read.email` OAuth scopes to read the
> email, and `message.channels` events for the channel it watches.

## Where it shows up in the portal

- **`/attendance`** — manager tier sees today's company roster (present / checked
  out / not in); everyone else sees their own last 14 days.
- Each event also drops an entry on the dashboard's Live Activity Wall
  ("checked in" / "checked out").

## Timezone

A "day" is a calendar day in **Pakistan Standard Time** (`Asia/Karachi`, UTC+5),
not the server's timezone — see `ATTENDANCE_TZ` in `lib/attendance.ts`. This is
independent of where the bot or portal run (Vercel is UTC). The bot should send
the event instant (`event.ts`); the portal buckets it into the correct PKT day,
so e.g. a 1 AM PKT check-in and a 9 AM PKT check-out land on the same row. To
change the business timezone later, edit `ATTENDANCE_TZ` (one constant).
