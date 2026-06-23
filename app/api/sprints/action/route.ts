import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { z } from "zod";

// Drive a sprint through its lifecycle (manager-tier only):
//   • start    PLANNED  → ACTIVE   (at most one ACTIVE sprint per board)
//   • complete ACTIVE   → COMPLETED (still-open cards fall back to the backlog)
//   • delete   any      → removed   (its cards fall back to the backlog via the
//                                     Sprint→Task SetNull FK)
const schema = z.object({
  sprintId: z.string().min(1),
  action: z.enum(["start", "complete", "delete"]),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!isManagerTier(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { sprintId, action } = schema.parse(await req.json());

    const sprint = await db.sprint.findUnique({
      where: { id: sprintId },
      select: { id: true, name: true, status: true, boardId: true },
    });
    if (!sprint) {
      return NextResponse.json({ error: "Sprint not found" }, { status: 404 });
    }

    if (action === "delete") {
      await db.sprint.delete({ where: { id: sprintId } });
      await audit({
        actor: user,
        action: "sprint.delete",
        entity: "Sprint",
        entityId: sprintId,
        summary: `${user.name} deleted sprint “${sprint.name}”`,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "start") {
      if (sprint.status !== "PLANNED") {
        return NextResponse.json(
          { error: "Only a planned sprint can be started" },
          { status: 400 },
        );
      }
      // One active sprint per board.
      const active = await db.sprint.findFirst({
        where: { boardId: sprint.boardId, status: "ACTIVE" },
        select: { id: true },
      });
      if (active) {
        return NextResponse.json(
          { error: "Another sprint is already active on this board" },
          { status: 409 },
        );
      }
      await db.sprint.update({
        where: { id: sprintId },
        data: { status: "ACTIVE", startedAt: new Date() },
      });
      await audit({
        actor: user,
        action: "sprint.start",
        entity: "Sprint",
        entityId: sprintId,
        summary: `${user.name} started sprint “${sprint.name}”`,
      });
      return NextResponse.json({ ok: true });
    }

    // action === "complete"
    if (sprint.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Only an active sprint can be completed" },
        { status: 400 },
      );
    }
    // Cards not Done at completion fall back to the backlog (sprintId = null),
    // the way JIRA returns incomplete work. Done cards stay attached for the
    // record. Both in one transaction with the status flip.
    const [movedBack] = await db.$transaction([
      db.task.updateMany({
        where: { sprintId, status: { not: "DONE" } },
        data: { sprintId: null },
      }),
      db.sprint.update({
        where: { id: sprintId },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
    ]);

    await audit({
      actor: user,
      action: "sprint.complete",
      entity: "Sprint",
      entityId: sprintId,
      summary: `${user.name} completed sprint “${sprint.name}”`,
      detail: { returnedToBacklog: movedBack.count },
    });

    return NextResponse.json({ ok: true, returnedToBacklog: movedBack.count });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
