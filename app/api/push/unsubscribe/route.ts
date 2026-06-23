import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ endpoint: z.string().url() });

// Remove this browser's push subscription. Scoped to the current user so one
// user can't delete another's subscription by guessing an endpoint.
export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { endpoint } = schema.parse(await req.json());

    await db.pushSubscription.deleteMany({
      where: { endpoint, userId: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
