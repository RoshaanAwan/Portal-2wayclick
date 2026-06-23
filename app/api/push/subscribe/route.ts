import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

// Save (or refresh) the current browser's Web Push subscription for this user.
// Upsert on the unique endpoint so re-subscribing in the same browser updates
// keys/owner rather than duplicating, and so a device that switches accounts
// reassigns cleanly.
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { endpoint, keys } = schema.parse(await req.json());

    const h = await headers();
    const userAgent = h.get("user-agent");

    await db.pushSubscription.upsert({
      where: { endpoint },
      create: {
        tenantId: user.tenantId,
        userId: user.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
      update: {
        userId: user.id,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
