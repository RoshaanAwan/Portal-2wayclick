// ── Integrations catalog (source of truth) ────────────────────────────────────
// The set of third-party apps that can be enabled on /tools. This is CODE config
// — icons, brand colors, default homepage, and copy — shared by the client grid
// and the admin page. The per-tenant *state* (enabled? custom workspace URL?)
// lives in the Integration table; merge the two with getIntegrationStates().
//
// `icon` is a Lucide icon NAME (not the component) so this stays a plain,
// server-safe module; the client maps the name → component (see ICONS in the
// grid/admin client). To add a provider: add an entry here and run a migration?
// No — no migration needed: rows are keyed by `provider` string, so a new
// catalog entry just shows up as "available, not enabled" until an admin turns
// it on.

export interface IntegrationDef {
  /** Stable key persisted in Integration.provider. Never rename. */
  provider: string;
  name: string;
  description: string;
  /** Public homepage / sign-in URL, used when no tenant workspace URL is set. */
  href: string;
  /** Lucide icon name (mapped to a component in client code). */
  icon: string;
  /** Tailwind gradient stops for the icon tile + matching glow rgba. */
  from: string;
  to: string;
  glow: string;
  /**
   * An INTERNAL portal route this integration drives (a live dashboard), e.g.
   * "/tools/github". When set and the integration is enabled+configured, the
   * tile links here (in-app) instead of out to `href`. Integrations without a
   * dashboard remain plain external links.
   */
  dashboard?: string;
  /** Whether connecting needs a credential (token). Drives the connect form. */
  needsCredential?: boolean;
  /**
   * Whether this integration is actually BUILT (has a working dashboard/connect
   * flow), versus a placeholder catalog entry. Only implemented integrations are
   * shown on the admin Integrations page and the Tools launchpad — placeholders
   * stay in the catalog (so adding them later is just flipping this) but are
   * hidden from users. Defaults to false.
   */
  implemented?: boolean;
}

/** The catalog entries that are actually built (implemented === true). Everything
 *  that reads the catalog for USER-FACING display should use this, not the raw
 *  INTEGRATIONS, so placeholder tiles never leak into the UI. */
export function isImplemented(def: IntegrationDef): boolean {
  return def.implemented === true;
}

export const INTEGRATIONS: IntegrationDef[] = [
  {
    provider: "slack",
    name: "Slack",
    description: "Team chat & channels",
    href: "https://slack.com",
    icon: "MessageSquare",
    from: "from-[#4A154B]",
    to: "to-[#E01E5A]",
    glow: "rgba(224,30,90,0.45)",
    dashboard: "/tools/slack",
    implemented: true,
    // The credential is the workspace's OAuth bot token (one per tenant, stored
    // in SlackConnection — NOT the Integration.secret), so the tile links to the
    // in-app dashboard as soon as the admin enables it; the dashboard handles the
    // "Add to Slack" connect. Like Google Drive, connection state lives elsewhere.
    needsCredential: false,
  },
  {
    provider: "github",
    name: "GitHub",
    description: "Code, PRs & reviews",
    href: "https://github.com",
    icon: "Github",
    from: "from-[#24292e]",
    to: "to-[#586069]",
    glow: "rgba(110,118,129,0.45)",
    dashboard: "/tools/github",
    implemented: true,
    needsCredential: true,
  },
  {
    provider: "jira",
    name: "Jira",
    description: "Sprints & issue tracking",
    href: "https://www.atlassian.com/software/jira",
    icon: "Trello",
    from: "from-[#0052CC]",
    to: "to-[#2684FF]",
    glow: "rgba(38,132,255,0.5)",
  },
  {
    provider: "figma",
    name: "Figma",
    description: "Design & prototyping",
    href: "https://figma.com",
    icon: "Figma",
    from: "from-[#F24E1E]",
    to: "to-[#A259FF]",
    glow: "rgba(162,89,255,0.5)",
  },
  {
    provider: "notion",
    name: "Notion",
    description: "Docs, wikis & notes",
    href: "https://notion.so",
    icon: "NotebookPen",
    from: "from-[#2F2F2F]",
    to: "to-[#6B6B6B]",
    glow: "rgba(120,120,120,0.45)",
  },
  {
    provider: "confluence",
    name: "Confluence",
    description: "Team knowledge base",
    href: "https://www.atlassian.com/software/confluence",
    icon: "BookText",
    from: "from-[#172B4D]",
    to: "to-[#0052CC]",
    glow: "rgba(0,82,204,0.5)",
  },
  {
    provider: "google-drive",
    name: "Google Drive",
    description: "Connect your Drive & upload files",
    href: "https://drive.google.com",
    icon: "HardDrive",
    from: "from-[#1FA463]",
    to: "to-[#FFCF63]",
    glow: "rgba(31,164,99,0.45)",
    dashboard: "/tools/google-drive",
    implemented: true,
    // The credential is PER-USER (each person OAuth-connects their own Drive),
    // not a tenant-wide secret — so the tile links to the in-app dashboard as
    // soon as the admin enables it; the dashboard handles per-user connect.
    needsCredential: false,
  },
  {
    provider: "gmail",
    name: "Gmail",
    description: "Send & read workspace email",
    href: "https://mail.google.com",
    icon: "Mail",
    from: "from-[#EA4335]",
    to: "to-[#FBBC04]",
    glow: "rgba(234,67,53,0.45)",
    dashboard: "/tools/gmail",
    implemented: true,
    // Gmail rides on the SAME owner Google connection as Drive (the owner connects
    // once; the portal sends as / reads that account). Connection state lives in
    // GoogleDriveConnection, not Integration.secret — so like Drive, the tile links
    // to the in-app dashboard as soon as the admin enables it.
    needsCredential: false,
  },
  {
    provider: "analytics",
    name: "Analytics",
    description: "Product & growth metrics",
    href: "https://analytics.google.com",
    icon: "BarChart3",
    from: "from-[#E8710A]",
    to: "to-[#F9AB00]",
    glow: "rgba(249,171,0,0.5)",
  },
  {
    provider: "expensify",
    name: "Expensify",
    description: "Receipts & reimbursements",
    href: "https://expensify.com",
    icon: "Receipt",
    from: "from-[#0B1B34]",
    to: "to-[#03D47C]",
    glow: "rgba(3,212,124,0.45)",
  },
  {
    provider: "pagerduty",
    name: "PagerDuty",
    description: "On-call & incidents",
    href: "https://pagerduty.com",
    icon: "Siren",
    from: "from-[#06AC38]",
    to: "to-[#25D366]",
    glow: "rgba(6,172,56,0.5)",
  },
];

/** The set of valid provider keys (for validating API input). */
export const INTEGRATION_PROVIDERS = INTEGRATIONS.map((i) => i.provider);

export function isIntegrationProvider(v: unknown): v is string {
  return typeof v === "string" && INTEGRATION_PROVIDERS.includes(v);
}

/** A catalog entry merged with this tenant's saved state. */
export interface IntegrationState extends IntegrationDef {
  enabled: boolean;
  /** The custom workspace URL the tenant set, if any (else null). */
  workspaceUrl: string | null;
  /** Whether a credential has been stored (token present). Never the value. */
  connected: boolean;
  /** Non-secret provider config (e.g. GitHub org/repos), or null. */
  config: Record<string, unknown> | null;
  /** Where the tile links: internal dashboard if it has one and is ready,
   *  else the workspace URL, else the catalog href. */
  linkTo: string;
  /** True when the tile opens an in-app dashboard (so it shouldn't open a new tab). */
  internal: boolean;
}

/** Compute the tile's link target + whether it's internal, from a catalog def
 *  and its saved state. Centralized so the grid and reader agree. */
export function resolveLink(
  def: IntegrationDef,
  state: { workspaceUrl: string | null; connected: boolean },
): { linkTo: string; internal: boolean } {
  // A dashboard-backed integration links in-app once it's actually connected.
  if (def.dashboard && (!def.needsCredential || state.connected)) {
    return { linkTo: def.dashboard, internal: true };
  }
  return { linkTo: state.workspaceUrl || def.href, internal: false };
}
