import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { isSuperAdmin } from "@/lib/permissions";
import { audit } from "@/lib/audit";
import { runWithTenant } from "@/lib/tenantContext";
import {
  setTenantDriveFolderSharing,
  DriveNotConnectedError,
  DriveError,
} from "@/lib/integrations/driveStorage";

// Flip link-sharing on the workspace Drive folder between "anyone with the link
// can view" (shared=true) and Restricted (shared=false). Owner-only — the owner's
// connection IS the tenant's Drive. The folder must already be set.

const schema = z.object({ shared: z.boolean() });

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!isSuperAdmin(user.role)) {
      return NextResponse.json(
        { error: "Only the company owner can change the Drive folder sharing." },
        { status: 403 },
      );
    }

    const { shared } = schema.parse(await req.json());

    await setTenantDriveFolderSharing(user.tenantId, user.id, shared);

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "GoogleDriveConnection",
        entityId: user.id,
        targetUserId: user.id,
        summary: `${user.name} set the workspace Drive folder to ${
          shared ? "anyone with the link" : "restricted"
        }`,
        detail: { folderShared: shared },
      }),
    );

    return NextResponse.json({ ok: true, shared });
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
    console.error("[google.folder.sharing]", e);
    return NextResponse.json(
      { error: "Couldn’t update the folder sharing." },
      { status: 500 },
    );
  }
}
