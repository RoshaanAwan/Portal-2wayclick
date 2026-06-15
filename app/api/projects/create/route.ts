import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  // Optional initial members (user ids) added alongside the creator.
  memberIds: z.array(z.string()).optional().default([]),
});

// Default Trello columns every new project board starts with.
const DEFAULT_LISTS = ["Backlog", "To Do", "In Progress", "Review", "Done"];

export async function POST(req: Request) {
  try {
    const actor = await requireUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { name, description, memberIds } = schema.parse(await req.json());

    // The creator is always a member; de-dup any explicit ids.
    const allMemberIds = Array.from(new Set([actor.id, ...memberIds]));

    const project = await db.project.create({
      data: {
        name,
        description: description || null,
        owner: { connect: { id: actor.id } },
        board: {
          create: {
            name,
            lists: {
              create: DEFAULT_LISTS.map((listName, i) => ({
                name: listName,
                position: i * 1000,
              })),
            },
          },
        },
        members: {
          create: allMemberIds.map((userId) => ({ userId })),
        },
      },
    });

    await recordActivity({ actor, verb: "created", target: `the “${name}” project` });

    await audit({
      actor,
      action: "project.create",
      entity: "Project",
      entityId: project.id,
      summary: `${actor.name} created project “${name}”`,
      detail: { name, memberCount: allMemberIds.length },
    });

    return NextResponse.json({ ok: true, id: project.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
