import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { z } from "zod";

// Create a PLANNED sprint on a board. Manager-tier only — sprints shape the
// team's iteration, so planning them sits with managers (mirrors who can decide
// leave / manage the board structure).
const schema = z.object({
  boardId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  goal: z.string().trim().max(500).optional(),
  // ISO dates (optional). Parsed leniently; stored as DateTime or null.
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    if (!isManagerTier(user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { boardId, name, goal, startDate, endDate } = schema.parse(
      await req.json(),
    );

    const board = await db.board.findUnique({
      where: { id: boardId },
      select: { id: true },
    });
    if (!board) {
      return NextResponse.json({ error: "Board not found" }, { status: 404 });
    }

    // New sprints sort to the bottom of the planner.
    const last = await db.sprint.findFirst({
      where: { boardId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const position = (last?.position ?? 0) + 1000;

    const sprint = await db.sprint.create({
      data: {
        boardId,
        name,
        goal: goal || null,
        startDate: startDate ? new Date(startDate) : null,
        endDate: endDate ? new Date(endDate) : null,
        position,
        status: "PLANNED",
      },
      select: { id: true, name: true },
    });

    await audit({
      actor: user,
      action: "sprint.create",
      entity: "Sprint",
      entityId: sprint.id,
      summary: `${user.name} created sprint “${name}”`,
      detail: { boardId },
    });

    return NextResponse.json({ ok: true, id: sprint.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
