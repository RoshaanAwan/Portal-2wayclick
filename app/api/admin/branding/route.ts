import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";

// Saves the white-label brand override (BrandingSettings singleton). Admin-tier
// only. Empty strings clear a field back to null (→ falls through to the env
// default in resolveBrand). The accent is validated as #rrggbb so the injected
// CSS is always well-formed.

// Trim, and turn "" into null so a cleared field reverts to the env default.
const blank = () =>
  z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null));

const schema = z.object({
  companyName: blank(),
  tagline: blank(),
  legalName: blank(),
  website: blank(),
  emailDomain: blank(),
  // A hosted URL (Vercel Blob, ~hundreds of chars) OR — when Blob isn't
  // configured — an inline base64 data: URL, which is large. Cap generously
  // enough to hold the 4 MB upload limit as base64 (~5.6M chars) plus overhead;
  // the column is TEXT so there's no DB limit. Accept http(s):// and data: only.
  logoUrl: z
    .string()
    .trim()
    .max(8_000_000)
    .refine(
      (v) => v === "" || /^(https?:\/\/|data:image\/)/.test(v),
      "Logo must be an http(s) URL or an image data URL",
    )
    .optional()
    .transform((v) => (v ? v : null)),
  accentHex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Accent must be a #rrggbb hex color")
    .optional()
    .transform((v) => (v ? v.toLowerCase() : null)),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageBranding(user.role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage branding." },
        { status: 403 },
      );
    }

    const data = schema.parse(await req.json());

    // One BrandingSettings row per tenant (tenantId @unique). The scoped client
    // auto-filters the upsert's where to this tenant, but we set tenantId
    // explicitly on the where/create so it targets exactly this tenant's row.
    const row = await db.brandingSettings.upsert({
      where: { tenantId: user.tenantId },
      create: { tenantId: user.tenantId, ...data, updatedBy: user.id },
      update: { ...data, updatedBy: user.id },
    });

    await audit({
      actor: user,
      action: "branding.update",
      entity: "BrandingSettings",
      entityId: row.id,
      summary: `${user.name} updated the brand settings`,
      detail: {
        companyName: row.companyName,
        accentHex: row.accentHex,
        hasLogo: !!row.logoUrl,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e?.message === "UNAUTHENTICATED") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        { error: e.errors[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    console.error("[branding.update]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
