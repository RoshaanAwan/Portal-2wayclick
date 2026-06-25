import { NextResponse } from "next/server";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { recordActivity } from "@/lib/activityFeed";
import { assertTaskAccess } from "@/lib/taskAccess";
import { notifyMany } from "@/lib/notifications";
import {
  uploadToTenantDrive,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Uploads an image (multipart/form-data, field "file") onto a card. The bytes
// land in the TENANT'S Google Drive (the company owner's connected Drive — the
// same backend documents/avatars use) and a TaskAttachment row records the Drive
// file id; the modal renders the image through /api/tasks/attachment/proxy. No
// base64 fallback: if the owner hasn't connected a Drive, the upload is blocked
// with a clear message (mirrors the avatar/document routes).
//
// Authorized via assertTaskAccess so a member can't attach to a board they
// aren't part of (same gate as comment/move/update).

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous for a screenshot/photo.
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();

    const form = await req.formData();
    const taskId = form.get("taskId");
    const file = form.get("file");

    if (typeof taskId !== "string" || !taskId) {
      return NextResponse.json({ error: "Missing task." }, { status: 400 });
    }
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Use a JPEG, PNG, WebP, or GIF image." },
        { status: 400 },
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "That image is empty." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be 10 MB or smaller." },
        { status: 400 },
      );
    }

    // Gate on the card's project (members-only for project boards; admin tier
    // bypasses; global board open). Resolves the task too — 404 if it's gone.
    const access = await assertTaskAccess(taskId, user);
    if (!access.ok) {
      return NextResponse.json(
        { error: access.status === 404 ? "Task not found" : "Forbidden" },
        { status: access.status },
      );
    }

    const task = await db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        title: true,
        creatorId: true,
        assignees: { select: { userId: true } },
      },
    });
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
    const bytes = Buffer.from(await file.arrayBuffer());
    // Project-board cards file under Projects; the global board's cards under
    // Tasks (assertTaskAccess already resolved the owning project, if any).
    const subfolderPath = access.projectId ? "Projects" : "Tasks";
    const uploaded = await uploadToTenantDrive(
      user.tenantId,
      {
        name: `task-${taskId}-${Date.now()}.${ext}`,
        mimeType: file.type,
        bytes,
      },
      { subfolderPath },
    );

    const attachment = await db.taskAttachment.create({
      data: {
        taskId,
        driveFileId: uploaded.id,
        name: file.name || `image.${ext}`,
        mimeType: file.type,
        uploaderId: user.id,
      },
      include: {
        uploader: { select: { id: true, name: true, avatarUrl: true } },
      },
    });

    await recordActivity({
      actor: user,
      verb: "uploaded",
      target: `an image to “${task.title}”`,
    });

    // Notify the card's watchers (creator + assignees), minus the uploader.
    const watchers = [
      task.creatorId,
      ...task.assignees.map((a) => a.userId),
    ].filter((id) => id !== user.id);
    await notifyMany(watchers, {
      type: "task.comment",
      message: `attached an image to “${task.title}”`,
      link: "/tasks",
      actor: user,
    });

    await audit({
      actor: user,
      action: "task.attachment_add",
      entity: "Task",
      entityId: task.id,
      summary: `${user.name} attached an image to “${task.title}”`,
      detail: { name: attachment.name, driveFileId: uploaded.id },
    });

    return NextResponse.json({
      ok: true,
      attachment: {
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        url: `/api/tasks/attachment/proxy?id=${attachment.id}`,
        createdAt: attachment.createdAt.toISOString(),
        uploader: {
          id: attachment.uploader.id,
          name: attachment.uploader.name,
          avatarUrl: attachment.uploader.avatarUrl,
        },
      },
    });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof DriveNotConnectedError) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    if (e instanceof DriveError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[tasks.attachment.upload]", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
