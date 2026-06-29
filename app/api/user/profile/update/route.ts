import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";

// Self-serve profile edit: the signed-in user updates their own display name,
// avatar, and contact details. Job title / department / role stay HR-managed
// (see the admin routes) and are intentionally not editable here.

const schema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(120),
  bio: z.string().trim().max(600, "Bio is too long").optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  location: z.string().trim().max(120).optional().or(z.literal("")),
  // A hosted URL (Vercel Blob) or an inline data URL from the upload route.
  // Empty string clears the avatar; omitted leaves it unchanged.
  avatarUrl: z.string().max(2_000_000).optional(),
  // Profile cover image — a /api/user/banner/proxy URL from the banner upload
  // route. Empty string clears the banner; omitted leaves it unchanged.
  bannerUrl: z.string().max(2000).optional(),
});

// Normalize optional text: empty string → null so we don't store "".
const orNull = (v: string | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export async function POST(req: Request) {
  try {
    const actor = await requireTenantUser();
    const data = schema.parse(await req.json());

    const updated = await db.user.update({
      where: { id: actor.id },
      data: {
        name: data.name,
        bio: orNull(data.bio),
        phone: orNull(data.phone),
        location: orNull(data.location),
        ...(data.avatarUrl !== undefined
          ? { avatarUrl: data.avatarUrl.trim() || null }
          : {}),
        ...(data.bannerUrl !== undefined
          ? { bannerUrl: data.bannerUrl.trim() || null }
          : {}),
      },
      select: { id: true, name: true, avatarUrl: true, bannerUrl: true },
    });

    // Track which fields the user touched (never log full field values — the
    // avatar can be a multi-MB data URL; just record that it changed).
    const changed: string[] = [];
    if (actor.name !== updated.name) changed.push("name");
    if (data.avatarUrl !== undefined && actor.avatarUrl !== updated.avatarUrl)
      changed.push("avatar");
    if (data.bannerUrl !== undefined && actor.bannerUrl !== updated.bannerUrl)
      changed.push("banner");
    if (actor.bio !== orNull(data.bio)) changed.push("bio");
    if (actor.phone !== orNull(data.phone)) changed.push("phone");
    if (actor.location !== orNull(data.location)) changed.push("location");

    await audit({
      actor,
      action: "user.profile_update",
      entity: "User",
      entityId: actor.id,
      targetUserId: actor.id,
      summary: `${updated.name} updated their profile`,
      detail: { fields: changed },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e?.name === "ZodError") {
      return NextResponse.json(
        { error: e.errors?.[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[profile.update]", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
