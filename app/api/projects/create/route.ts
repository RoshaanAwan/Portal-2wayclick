import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { can } from "@/lib/permissions";
import { newShareToken, shareUrl } from "@/lib/share";
import { templateColumns } from "@/lib/constants";
import { z } from "zod";

const schema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  // Optional initial members (user ids) added alongside the creator.
  memberIds: z.array(z.string()).optional().default([]),
  // Optional leads. Must be project members (enforced below); null/omitted =
  // unassigned, to be set later from the project page.
  projectLeadId: z.string().nullish(),
  techLeadId: z.string().nullish(),
  // Board template id (lib/constants PROJECT_TEMPLATES). Decides the starting
  // columns; an unknown/omitted id falls back to the default template.
  template: z.string().nullish(),
});

export async function POST(req: Request) {
  try {
    const actor = await requireTenantUser();
    if (!can.manageProjects(actor.role)) {
      return NextResponse.json({ error: "Admins only" }, { status: 403 });
    }

    const { name, description, memberIds, projectLeadId, techLeadId, template } =
      schema.parse(await req.json());

    // Resolve the chosen board template → starting columns (falls back to the
    // default template for an unknown/omitted id).
    const lists = templateColumns(template);

    // The creator is always a member; de-dup any explicit ids.
    const allMemberIds = Array.from(new Set([actor.id, ...memberIds]));

    // A lead must be one of the project's members. Anything else (a stale id, a
    // non-member) is dropped to null rather than rejected — leads are optional.
    const memberSet = new Set(allMemberIds);
    const leadId = projectLeadId && memberSet.has(projectLeadId) ? projectLeadId : null;
    const techId = techLeadId && memberSet.has(techLeadId) ? techLeadId : null;

    // Every project ships with a client share link from the start so the
    // creator can hand it off immediately (revoke/regenerate later if needed).
    const shareToken = newShareToken();

    const project = await db.project.create({
      data: {
        // This create uses relation inputs (owner/board/members), which selects
        // Prisma's "checked" create variant — so tenant must be a relation
        // connect here, not the scalar tenantId. (The runtime extension injects
        // tenantId too, but typing it explicitly keeps tsc honest.)
        tenant: { connect: { id: actor.tenantId } },
        name,
        description: description || null,
        shareToken,
        owner: { connect: { id: actor.id } },
        ...(leadId ? { projectLead: { connect: { id: leadId } } } : {}),
        ...(techId ? { techLead: { connect: { id: techId } } } : {}),
        board: {
          create: {
            tenantId: actor.tenantId,
            name,
            lists: {
              create: lists.map((listName, i) => ({
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
      detail: { name, memberCount: allMemberIds.length, projectLeadId: leadId, techLeadId: techId, template: template ?? null },
    });

    // Build the share link on this tenant's host (subdomain from middleware).
    const subdomain = (await headers()).get("x-tenant-subdomain");

    return NextResponse.json({
      ok: true,
      id: project.id,
      shareUrl: shareUrl(shareToken, subdomain),
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
