import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSystemOwner } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { INTEGRATIONS, isIntegrationProvider } from "@/lib/integrations";
import { seal } from "@/lib/cryptoBox";
import { verifyToken } from "@/lib/integrations/github";
import { runWithTenant } from "@/lib/tenantContext";

const schema = z.object({
  provider: z.string().refine(isIntegrationProvider, "Unknown integration"),
  enabled: z.boolean(),
  workspaceUrl: z
    .string()
    .trim()
    .max(2000)
    .refine(
      (v) => v === "" || /^https?:\/\/\S+$/.test(v),
      "Workspace URL must be an http(s) link",
    )
    .optional()
    .transform((v) => (v ? v : null)),
  token: z.string().trim().max(500).optional(),
  config: z.record(z.any()).optional(),
});

const githubConfigSchema = z.object({
  org: z
    .string()
    .trim()
    .max(100)
    .regex(/^[A-Za-z0-9-]*$/, "Org must be a GitHub login")
    .optional()
    .transform((v) => (v ? v : null)),
  repos: z
    .array(z.string().trim())
    .optional()
    .transform((arr) =>
      (arr ?? [])
        .map((r) => r.trim())
        .filter((r) => /^[^/\s]+\/[^/\s]+$/.test(r)),
    ),
});

const googleConfigSchema = z.object({
  googleClientId: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function POST(req: Request) {
  try {
    const user = await requireSystemOwner();

    const data = schema.parse(await req.json());
    const def = INTEGRATIONS.find((i) => i.provider === data.provider)!;

    let configToStore: unknown = undefined;
    let sealedSecret: string | null | undefined = undefined;

    if (data.provider === "github") {
      const cfg = githubConfigSchema.parse(data.config ?? {});
      configToStore = cfg;

      const newToken = data.token?.trim();
      if (newToken) {
        try {
          await verifyToken(newToken);
        } catch {
          return NextResponse.json(
            { error: "GitHub rejected that token. Check it has repo read access." },
            { status: 400 },
          );
        }
        sealedSecret = seal(newToken);
      }

      const willHaveToken = sealedSecret !== undefined || !!(await db.integration.findFirst({
        where: { provider: "github" },
        select: { secret: true },
      }))?.secret;
      if (data.enabled && !willHaveToken) {
        return NextResponse.json(
          { error: "Add a GitHub access token before enabling this integration." },
          { status: 400 },
        );
      }
    } else if (data.provider === "google-drive") {
      const cfg = googleConfigSchema.parse(data.config ?? {});
      configToStore = cfg;

      const newSecret = data.token?.trim();
      if (newSecret) sealedSecret = seal(newSecret);
    }

    const row = await db.integration.upsert({
      where: {
        tenantId_provider: { tenantId: user.tenantId, provider: data.provider },
      },
      create: {
        tenantId: user.tenantId,
        provider: data.provider,
        enabled: data.enabled,
        workspaceUrl: data.workspaceUrl,
        secret: sealedSecret ?? null,
        config: (configToStore as any) ?? undefined,
        updatedBy: user.id,
      },
      update: {
        enabled: data.enabled,
        workspaceUrl: data.workspaceUrl,
        ...(sealedSecret !== undefined ? { secret: sealedSecret } : {}),
        ...(configToStore !== undefined ? { config: configToStore as any } : {}),
        updatedBy: user.id,
      },
    });

    await runWithTenant(user.tenantId, () =>
      audit({
        actor: user,
        action: "integration.update",
        entity: "Integration",
        entityId: row.id,
        summary: `${user.name} ${row.enabled ? "enabled" : "disabled"} the ${def.name} integration`,
        detail: {
          provider: row.provider,
          enabled: row.enabled,
          hasWorkspaceUrl: !!row.workspaceUrl,
          connected: !!row.secret,
        },
      }),
    );

    return NextResponse.json({
      ok: true,
      provider: row.provider,
      enabled: row.enabled,
      workspaceUrl: row.workspaceUrl,
      connected: !!row.secret,
      config: row.config ?? null,
    });
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
    console.error("[system.integration.update]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
