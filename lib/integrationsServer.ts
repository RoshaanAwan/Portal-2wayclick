import "server-only";
import { cache } from "react";
import { db } from "./db";
import {
  INTEGRATIONS,
  resolveLink,
  type IntegrationState,
} from "./integrations";
import { open } from "./cryptoBox";

// ── Integrations (DB layer) ───────────────────────────────────────────────────
// Merges the per-tenant Integration rows over the code catalog (lib/integrations
// .ts). A provider with no row is "available but off". Scoped `db` auto-filters
// to the active tenant, so this only ever returns the current tenant's state.
//
// The encrypted `secret` is NEVER returned from here — callers get only a
// `connected` boolean. To actually use the token (server-side API calls) use
// getIntegrationSecret(), which decrypts on demand.
//
// Cached per request (like getBrandingRow) so the /tools grid and any badge that
// needs the connected count share one query. Falls back to the all-disabled
// catalog if the table isn't migrated yet or the DB is unreachable.

type Row = {
  provider: string;
  enabled: boolean;
  workspaceUrl: string | null;
  secret: string | null;
  config: unknown;
};

export const getIntegrationStates = cache(
  async (): Promise<IntegrationState[]> => {
    let rows: Row[] = [];
    try {
      rows = await db.integration.findMany({
        select: {
          provider: true,
          enabled: true,
          workspaceUrl: true,
          secret: true,
          config: true,
        },
      });
    } catch {
      rows = [];
    }

    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return INTEGRATIONS.map((def) => {
      const row = byProvider.get(def.provider);
      const enabled = row?.enabled ?? false;
      const workspaceUrl = row?.workspaceUrl ?? null;
      const connected = !!row?.secret;
      const config =
        row?.config && typeof row.config === "object"
          ? (row.config as Record<string, unknown>)
          : null;
      const { linkTo, internal } = resolveLink(def, { workspaceUrl, connected });
      return {
        ...def,
        enabled,
        workspaceUrl,
        connected,
        config,
        linkTo,
        internal,
      };
    });
  },
);

/** How many integrations this tenant has switched on. */
export async function connectedIntegrationCount(): Promise<number> {
  const states = await getIntegrationStates();
  return states.filter((s) => s.enabled).length;
}

/**
 * Resolve the Google OAuth app credentials for the CURRENT tenant. Each tenant's
 * admin registers their OWN Google Cloud OAuth app and pastes the Client ID
 * (config.googleClientId) + Client Secret (encrypted in `secret`) on the admin
 * page. Falls back to the platform-wide GOOGLE_CLIENT_ID/SECRET env vars when a
 * tenant hasn't set its own. Returns null if neither is configured.
 */
export async function getGoogleOAuthCreds(): Promise<{
  clientId: string;
  clientSecret: string;
} | null> {
  // 1) Tenant's own app (preferred).
  try {
    const row = await db.integration.findFirst({
      where: { provider: "google-drive" },
      select: { secret: true, config: true },
    });
    const cfg =
      row?.config && typeof row.config === "object"
        ? (row.config as Record<string, unknown>)
        : null;
    const clientId =
      cfg && typeof cfg.googleClientId === "string" ? cfg.googleClientId.trim() : "";
    const clientSecret = row?.secret ? (open(row.secret) ?? "") : "";
    if (clientId && clientSecret) return { clientId, clientSecret };
  } catch {
    /* fall through to env */
  }

  // 2) Platform fallback (env).
  const envId = process.env.GOOGLE_CLIENT_ID;
  const envSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (envId && envSecret) return { clientId: envId, clientSecret: envSecret };

  return null;
}

/** Whether the tenant admin has switched a provider ON (the tile-level gate).
 *  Per-user features (Google Drive connect) check this before letting a user
 *  connect — an admin must enable the tool for the workspace first. */
export async function isIntegrationEnabled(provider: string): Promise<boolean> {
  try {
    const row = await db.integration.findFirst({
      where: { provider },
      select: { enabled: true },
    });
    return !!row?.enabled;
  } catch {
    return false;
  }
}

/**
 * Read a provider's DECRYPTED credential + config for the current tenant. Server
 * only — used by dashboard pages / API routes that call the provider's API.
 * Returns null if not connected. The scoped `db` keeps this tenant-bound.
 */
export async function getIntegrationSecret(provider: string): Promise<{
  token: string;
  config: Record<string, unknown>;
} | null> {
  let row: { secret: string | null; config: unknown; enabled: boolean } | null =
    null;
  try {
    row = await db.integration.findFirst({
      where: { provider },
      select: { secret: true, config: true, enabled: true },
    });
  } catch {
    return null;
  }
  if (!row || !row.enabled || !row.secret) return null;
  const token = open(row.secret);
  if (!token) return null;
  const config =
    row.config && typeof row.config === "object"
      ? (row.config as Record<string, unknown>)
      : {};
  return { token, config };
}
