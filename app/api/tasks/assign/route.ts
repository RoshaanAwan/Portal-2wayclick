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
    const actor = await requireUser();
    const { taskId, userId } = schema.parse(await req.json());

    const [task, member] = await Promise.all([
      db.task.findUnique({ where: { id: taskId }, select: { id: true, title: true } }),
      db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    ]);
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!member) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Idempotent: re-assigning an existing member is a no-op (unique constraint).
    const assignment = await db.taskAssignee.upsert({
      where: { taskId_userId: { taskId, userId } },
      create: { taskId, userId },
      update: {},
    });

    // Surface assignment in the activity feed (skip self-assignment noise).
    if (actor.id !== userId) {
      await db.activity.create({
        data: {
          userId: actor.id,
          verb: "assigned",
          target: `${member.name} to “${task.title}”`,
        },
      });
    }

    return NextResponse.json({ ok: true, id: assignment.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
