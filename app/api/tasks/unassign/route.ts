import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
  userId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    await requireUser();
    const { taskId, userId } = schema.parse(await req.json());

    // deleteMany is idempotent — removing a non-existent assignment is fine.
    await db.taskAssignee.deleteMany({ where: { taskId, userId } });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
