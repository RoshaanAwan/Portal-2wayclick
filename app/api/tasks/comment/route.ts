import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  taskId: z.string().min(1),
  body: z.string().trim().min(1).max(1000),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { taskId, body } = schema.parse(await req.json());

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: { id: true, title: true },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const comment = await db.taskComment.create({
      data: { taskId, authorId: user.id, body },
      include: {
        author: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await db.activity.create({
      data: {
        userId: user.id,
        verb: "commented",
        target: `on “${task.title}”`,
      },
    });

    // Return the created comment so the client can render it immediately.
    return NextResponse.json({
      ok: true,
      comment: {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.author.id,
          name: comment.author.name,
          avatarUrl: comment.author.avatarUrl,
        },
      },
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
