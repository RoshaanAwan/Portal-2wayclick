import { NextResponse } from "next/server";
import { z } from "zod";
import { requireTenantUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { can } from "@/lib/permissions";
import { INTEGRATIONS, isIntegrationProvider } from "@/lib/integrations";
import { seal } from "@/lib/cryptoBox";
import { verifyToken } from "@/lib/integrations/github";
import { runWithTenant } from "@/lib/tenantContext";

// Enable/disable & configure one integration for the current tenant. Admin-tier
// only. One Integration row per (tenant, provider); upsert so the first save for
// a provider creates the row. The scoped `db` keeps every query pinned to the
// caller's tenant.
//
// For credential-based providers (GitHub) the body may also carry a `token`
// (validated against the provider API, then encrypted at rest) and a `config`
// (non-secret, e.g. org/repos). Omitting `token` on a re-save keeps the existing
// one — the token is write-only, never echoed back to the client.

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
  // Optional credential — only for providers that need one. "" / omitted = leave
  // the stored token unchanged. A new non-empty value replaces it.
  token: z.string().trim().max(500).optional(),
  // Provider-specific non-secret config (e.g. { org, repos }). Validated per
  // provider below.
  config: z.record(z.any()).optional(),
});

// GitHub config: an optional org and/or an explicit owner/repo list.
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

// Google Drive config: the tenant's OWN OAuth Client ID (non-secret). The Client
// Secret arrives as `token` and is stored encrypted in `secret`.
const googleConfigSchema = z.object({
  googleClientId: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

// Slack config: the tenant's OWN OAuth app Client ID (non-secret). The Client
// Secret arrives as `token` and is stored encrypted in `secret`. The workspace
// bot token (from the OAuth handshake) lives separately in SlackConnection.
const slackConfigSchema = z.object({
  slackClientId: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function POST(req: Request) {
  try {
    const user = await requireTenantUser();
    if (!can.manageIntegrations(user.role)) {
      return NextResponse.json(
        { error: "You do not have permission to manage integrations." },
        { status: 403 },
      );
    }

    const data = schema.parse(await req.json());
    const def = INTEGRATIONS.find((i) => i.provider === data.provider)!;

    // The row that may already hold a token we want to keep.
    const existing = await db.integration.findFirst({
      where: { provider: data.provider },
      select: { secret: true },
    });

    // Resolve config + credential per provider.
    let configToStore: unknown = undefined; // undefined = don't change
    let sealedSecret: string | null | undefined = undefined; // undefined = keep

    if (data.provider === "github") {
      const cfg = githubConfigSchema.parse(data.config ?? {});
      configToStore = cfg;

      const newToken = data.token?.trim();
      if (newToken) {
        // Validate the token against GitHub before saving.
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

      // Block enabling GitHub with no token at all (nothing to fetch with).
      const willHaveToken = sealedSecret !== undefined || !!existing?.secret;
      if (data.enabled && !willHaveToken) {
        return NextResponse.json(
          { error: "Add a GitHub access token before enabling this integration." },
          { status: 400 },
        );
      }
    } else if (data.provider === "google-drive") {
      const cfg = googleConfigSchema.parse(data.config ?? {});
      configToStore = cfg;

      // The Client Secret comes through as `token` → store encrypted.
      const newSecret = data.token?.trim();
      if (newSecret) sealedSecret = seal(newSecret);

      // The tile may be enabled even before the Google app is set (the dashboard
      // shows a "configure your Google app" notice, and a platform env fallback
      // may exist). So we DON'T hard-block enabling here — unlike GitHub, the
      // credential is the tenant's OAuth app, which the per-user connect flow
      // (and getGoogleOAuthCreds env fallback) handles gracefully.
    } else if (data.provider === "slack") {
      const cfg = slackConfigSchema.parse(data.config ?? {});
      configToStore = cfg;

      // The Slack app's Client Secret comes through as `token` → store encrypted.
      const newSecret = data.token?.trim();
      if (newSecret) sealedSecret = seal(newSecret);

      // Like Google Drive, don't hard-block enabling: the tile can be on before
      // the app is configured (the dashboard shows "Add to Slack" / "ask an
      // admin" states), and a platform env fallback (SLACK_CLIENT_ID/SECRET) may
      // exist. The OAuth connect flow validates the credentials at handshake.
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
        // Only overwrite the secret when a new one was provided.
        ...(sealedSecret !== undefined ? { secret: sealedSecret } : {}),
        ...(configToStore !== undefined ? { config: configToStore as any } : {}),
        updatedBy: user.id,
      },
    });

    // Wrap in runWithTenant so audit()'s requireTenantId() always sees the
    // tenant — the ALS context set by getCurrentUser (enterWith) can be lost
    // across the awaits above (req.json / the GitHub fetch) in this runtime;
    // the scoped `db` recovers via the request cookie, but audit() doesn't.
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
    console.error("[integration.update]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
