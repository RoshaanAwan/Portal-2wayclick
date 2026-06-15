import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  projectId: z.string().min(1),
  userId: z.string().min(1),
  // true → add the user to the project, false → remove them.
  add: z.boolean(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (actor.role !== "ADMIN") {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { projectId, userId, add } = schema.parse(await req.json());

    const [project, member] = await Promise.all([
      db.project.findUnique({
        where: { id: projectId },
        select: { id: true, name: true, ownerId: true },
      }),
      db.user.findUnique({ where: { id: userId }, select: { id: true, name: true } }),
    ]);
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!member)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (add) {
      // Idempotent — re-adding an existing member is a no-op.
      await db.projectMember.upsert({
        where: { projectId_userId: { projectId, userId } },
        create: { projectId, userId },
        update: {},
      });
    } else {
      // The owner can't be removed from their own project.
      if (userId === project.ownerId) {
        return NextResponse.json(
          { error: "Cannot remove the project owner" },
          { status: 400 },
        );
      }
      await db.projectMember.deleteMany({ where: { projectId, userId } });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
