import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { sendPushToUser, isPushConfigured } from "@/lib/push";
import { resolveBrand } from "@/lib/branding";

// Send a confirmation push to the current user's devices. Used right after they
// enable push so they can see it working immediately.
export async function POST() {
  try {
    const user = await requireUser();
    if (!isPushConfigured()) {
      return NextResponse.json(
        { error: "Push is not configured on the server." },
        { status: 503 },
      );
    }

    const brand = await resolveBrand();
    await sendPushToUser(user.id, {
      title: brand.name,
      body: "Push notifications are on — you'll be notified here.",
      url: "/dashboard",
      tag: "push.test",
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
