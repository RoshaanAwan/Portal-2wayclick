import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isManagerTier } from "@/lib/permissions";
import { assertTaskAccess } from "@/lib/taskAccess";
import { deleteFromTenantDrive, DriveError } from "@/lib/integrations/driveStorage";
import { z } from "zod";

const schema = z.object({ attachmentId: z.string().min(1) });

// Removes a card image attachment: deletes the Drive file (best-effort) then the
// row. Permitted to the uploader, the card's creator, or any manager-tier user —
// on top of the card's project access gate (assertTaskAccess).

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    const { attachmentId } = schema.parse(await req.json());

    const attachment = await db.taskAttachment.findUnique({
      where: { id: attachmentId },
      select: {
        id: true,
        driveFileId: true,
        name: true,
        uploaderId: true,
        taskId: true,
        task: { select: { title: true, creatorId: true } },
      },
    });
    if (!attachment) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const access = await assertTaskAccess(attachment.taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Not found" : "Forbidden" },
        { status: access.status },
      );
    }

    // Uploader, card creator, or a manager may delete the image.
    const canDelete =
      attachment.uploaderId === user.id ||
      attachment.task.creatorId === user.id ||
      isManagerTier(user.role);
    if (!canDelete) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Best-effort Drive cleanup — a leftover Drive file must never block removing
    // the attachment from the card. Then drop the row.
    try {
      await deleteFromTenantDrive(user.tenantId, attachment.driveFileId);
    } catch (e) {
      console.error("[tasks.attachment.delete] drive cleanup failed", e);
    }

    await db.taskAttachment.delete({ where: { id: attachment.id } });

    await audit({
      actor: user,
      action: "task.attachment_remove",
      entity: "Task",
      entityId: attachment.taskId,
      summary: `${user.name} removed an image from “${attachment.task.title}”`,
      detail: { name: attachment.name, driveFileId: attachment.driveFileId },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof DriveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
