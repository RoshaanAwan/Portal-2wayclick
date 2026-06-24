import "server-only";

// ── GitHub integration client ─────────────────────────────────────────────────
// Thin wrapper over the GitHub REST API (v3) using fetch + a Personal Access
// Token. No SDK dependency. Used by the /tools/github dashboard to list open pull
// requests across the repos an admin configured, and by the connect form to
// validate a token + resolve which repos it can see.
//
// All calls are server-side only (the token never reaches the client). Errors are
// surfaced as thrown GitHubError with a friendly message + status.

const API = "https://api.github.com";
const UA = "2wayclick-portal";

export interface GitHubConfig {
  /** Optional org/user login — all its repos are scanned when no explicit repos. */
  org?: string | null;
  /** Explicit "owner/repo" entries. Take precedence/augment the org scan. */
  repos?: string[];
}

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  url: string;
  repo: string; // "owner/repo"
  author: string;
  authorAvatar: string;
  draft: boolean;
  reviewers: string[];
  labels: { name: string; color: string }[];
  createdAt: string;
  updatedAt: string;
  comments: number;
}

export class GitHubError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function headers(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": UA,
  };
}

async function gh<T>(path: string, token: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: headers(token),
      // PR data is fine slightly stale; cache for a minute to respect rate limits.
      next: { revalidate: 60 },
    });
  } catch {
    throw new GitHubError("Could not reach GitHub.", 502);
  }
  if (res.status === 401)
    throw new GitHubError("GitHub rejected the token (unauthorized).", 401);
  if (res.status === 403)
    throw new GitHubError(
      "GitHub forbade the request (rate-limited or missing scope).",
      403,
    );
  if (res.status === 404)
    throw new GitHubError("Not found — check the org/repo name.", 404);
  if (!res.ok)
    throw new GitHubError(`GitHub error (${res.status}).`, res.status);
  return (await res.json()) as T;
}

/** Validate a token and return the authenticated login. Throws on bad token. */
export async function verifyToken(
  token: string,
): Promise<{ login: string; name: string | null }> {
  const me = await gh<{ login: string; name: string | null }>("/user", token);
  return { login: me.login, name: me.name };
}

/** Resolve the concrete "owner/repo" list to scan from the config. When only an
 *  org is given, list its repos (first 100, most recently pushed). */
async function resolveRepos(
  token: string,
  config: GitHubConfig,
): Promise<string[]> {
  const explicit = (config.repos ?? [])
    .map((r) => r.trim())
    .filter((r) => /^[^/\s]+\/[^/\s]+$/.test(r));
  if (explicit.length > 0) return Array.from(new Set(explicit));

  if (config.org) {
    const org = config.org.trim();
    // Try org repos first; fall back to user repos if the login is a user.
    let repos: { full_name: string }[];
    try {
      repos = await gh<{ full_name: string }[]>(
        `/orgs/${encodeURIComponent(org)}/repos?per_page=100&sort=pushed`,
        token,
      );
    } catch (e) {
      if (e instanceof GitHubError && e.status === 404) {
        repos = await gh<{ full_name: string }[]>(
          `/users/${encodeURIComponent(org)}/repos?per_page=100&sort=pushed`,
          token,
        );
      } else throw e;
    }
    return repos.map((r) => r.full_name);
  }
  return [];
}

interface RawPR {
  id: number;
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  created_at: string;
  updated_at: string;
  comments?: number;
  user: { login: string; avatar_url: string } | null;
  requested_reviewers?: { login: string }[];
  labels?: { name: string; color: string }[];
}

/** List open pull requests across the configured repos. Repos that error
 *  (e.g. one bad name) are skipped, not fatal — the rest still load. */
export async function listOpenPRs(
  token: string,
  config: GitHubConfig,
): Promise<{ prs: PullRequest[]; repos: string[]; skipped: string[] }> {
  const repos = await resolveRepos(token, config);
  const skipped: string[] = [];

  const perRepo = await Promise.all(
    repos.map(async (full): Promise<PullRequest[]> => {
      try {
        const raw = await gh<RawPR[]>(
          `/repos/${full}/pulls?state=open&per_page=50&sort=updated&direction=desc`,
          token,
        );
        return raw.map((p) => ({
          id: p.id,
          number: p.number,
          title: p.title,
          url: p.html_url,
          repo: full,
          author: p.user?.login ?? "unknown",
          authorAvatar: p.user?.avatar_url ?? "",
          draft: p.draft,
          reviewers: (p.requested_reviewers ?? []).map((r) => r.login),
          labels: (p.labels ?? []).map((l) => ({
            name: l.name,
            color: l.color,
          })),
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          comments: p.comments ?? 0,
        }));
      } catch {
        skipped.push(full);
        return [];
      }
    }),
  );

  const prs = perRepo
    .flat()
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  return { prs, repos, skipped };
}
