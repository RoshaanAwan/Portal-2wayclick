import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dmKeyFor } from "@/lib/messaging";
import { can } from "@/lib/permissions";

// Create (or resolve an existing) conversation. Three kinds:
//   dm      — 1-on-1; deduped by dmKey @unique so it can only exist once.
//   group   — named, arbitrary members (creator always included).
//   project — auto-tied to a Project (1:1 via projectId @unique); roster seeded
//             from the project's members + owner. Requires the caller to belong
//             to the project (member/owner) or be admin tier.
// Anyone can DM/group anyone — reach is open at create time; once a conversation
// exists only its members can read/write it (enforced per-route via membership).
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("dm"), userId: z.string().min(1) }),
  z.object({
    kind: z.literal("group"),
    title: z.string().trim().min(1).max(120),
    userIds: z.array(z.string().min(1)).min(1).max(100),
  }),
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }),
]);

export async function POST(req: Request) {
  try {
    const me = await requireUser();
    const input = schema.parse(await req.json());

    if (input.kind === "dm") {
      if (input.userId === me.id)
        return NextResponse.json(
          { error: "Cannot DM yourself" },
          { status: 400 },
        );
      const other = await db.user.findUnique({
        where: { id: input.userId },
        select: { id: true, disabledAt: true },
      });
      if (!other || other.disabledAt)
        return NextResponse.json({ error: "User not found" }, { status: 404 });

      const dmKey = dmKeyFor(me.id, input.userId);
      // Upsert on (tenantId, dmKey) collapses two simultaneous "open DM" requests
      // onto one row. The nested member create only runs on first creation.
      const convo = await db.conversation.upsert({
        where: { tenantId_dmKey: { tenantId: me.tenantId, dmKey } },
        create: {
          tenantId: me.tenantId,
          kind: "dm",
          dmKey,
          createdById: me.id,
          members: {
            create: [{ userId: me.id }, { userId: input.userId }],
          },
        },
        update: {},
        select: { id: true },
      });
      return NextResponse.json({ id: convo.id });
    }

    if (input.kind === "group") {
      // Creator is always a member; de-dupe and validate the rest.
      const ids = [...new Set([me.id, ...input.userIds])];
      const users = await db.user.findMany({
        where: { id: { in: ids }, disabledAt: null },
        select: { id: true },
      });
      const validIds = users.map((u) => u.id);
      if (!validIds.includes(me.id)) validIds.push(me.id);

      const convo = await db.conversation.create({
        data: {
          tenantId: me.tenantId,
          kind: "group",
          title: input.title,
          createdById: me.id,
          members: { create: validIds.map((userId) => ({ userId })) },
        },
        select: { id: true },
      });
      return NextResponse.json({ id: convo.id });
    }

    // input.kind === "project"
    const project = await db.project.findUnique({
      where: { id: input.projectId },
      select: {
        id: true,
        name: true,
        ownerId: true,
        members: { select: { userId: true } },
      },
    });
    if (!project)
      return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const rosterIds = [
      ...new Set([project.ownerId, ...project.members.map((m) => m.userId)]),
    ];
    // Only someone on the project (or admin tier) can open its channel.
    if (!rosterIds.includes(me.id) && !can.accessAdmin(me.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // Upsert on projectId so a project has exactly one channel. On first create
    // seed the roster; if the caller is admin-but-not-on-the-project, include
    // them so they're a member of the channel they just opened.
    const seedIds = rosterIds.includes(me.id)
      ? rosterIds
      : [...rosterIds, me.id];
    const convo = await db.conversation.upsert({
      where: { projectId: project.id },
      create: {
        tenantId: me.tenantId,
        kind: "project",
        title: project.name,
        projectId: project.id,
        createdById: me.id,
        members: { create: seedIds.map((userId) => ({ userId })) },
      },
      update: {},
      select: { id: true, members: { where: { userId: me.id }, select: { id: true } } },
    });

    // If the channel already existed but the caller isn't a member yet (e.g. an
    // admin opening it, or someone newly added to the project), add them so they
    // can read/write.
    if (convo.members.length === 0) {
      await db.conversationMember.create({
        data: { conversationId: convo.id, userId: me.id },
      });
    }
    return NextResponse.json({ id: convo.id });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (e instanceof z.ZodError)
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
