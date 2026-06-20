import "server-only";
import { db } from "./db";
import {
  WORKFLOW_STATUSES,
  type WorkflowStatus,
} from "./constants";

// ── JIRA-like issue helpers ───────────────────────────────────────────────────
// One card (Task) is one "issue". This module owns the cross-cutting issue
// rules that need both the board (key prefix, sequence) and the workflow
// constants: minting stable issue keys, parsing them back, and keeping the
// Kanban column (BoardList) and the workflow `status` field in lock-step.
//
// Server-only: it touches the DB and is imported by API routes / server pages.

/** Format a card's key, e.g. ("PORTAL", 42) → "PORTAL-42". */
export function issueKey(keyPrefix: string, issueNumber: number | null): string {
  return issueNumber == null ? "—" : `${keyPrefix}-${issueNumber}`;
}

/**
 * Parse a "PREFIX-123" key into its parts. Case-insensitive on the prefix
 * (uppercased to match how keys are stored). Returns null for anything that
 * isn't `<letters/digits>-<number>`.
 */
export function parseIssueKey(
  key: string,
): { prefix: string; number: number } | null {
  // The prefix is alphanumeric (a board's keyPrefix can start with a digit,
  // e.g. "2WAYCL"), followed by "-<number>".
  const m = /^([A-Za-z0-9]+)-(\d+)$/.exec(key.trim());
  if (!m) return null;
  return { prefix: m[1].toUpperCase(), number: Number(m[2]) };
}

/** Build a board key prefix from a name: "2WayClick Portal" → "PORTAL". */
export function keyPrefixFromName(name: string): string {
  const cleaned = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .trim();
  // Prefer an acronym from multiple words; otherwise the first 6 alnum chars.
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return words.map((w) => w[0]).join("").slice(0, 6) || "TASK";
  }
  const single = (words[0] ?? "").replace(/[^A-Z0-9]/g, "");
  return single.slice(0, 6) || "TASK";
}

// ── Workflow ↔ Kanban column mapping ──────────────────────────────────────────
// The board groups cards by list (column); JIRA filters/reports group by the
// `status` field. We keep them consistent: whenever a card lands in a list we
// derive its status from the list's name, and the seed/board names the columns
// to match. Unknown list names fall back to TODO so the board never breaks.

const LIST_NAME_TO_STATUS: Record<string, WorkflowStatus> = {
  backlog: "TODO",
  "to do": "TODO",
  todo: "TODO",
  "in progress": "IN_PROGRESS",
  doing: "IN_PROGRESS",
  review: "IN_REVIEW",
  "in review": "IN_REVIEW",
  qa: "IN_REVIEW",
  done: "DONE",
  closed: "DONE",
  shipped: "DONE",
};

/** Derive the workflow status a card should carry given the list it sits in. */
export function statusForList(listName: string): WorkflowStatus {
  return LIST_NAME_TO_STATUS[listName.trim().toLowerCase()] ?? "TODO";
}

/** Guard for the WorkflowStatus union (used when validating API input). */
export function isWorkflowStatus(v: unknown): v is WorkflowStatus {
  return (
    typeof v === "string" &&
    (WORKFLOW_STATUSES as readonly string[]).includes(v)
  );
}

/**
 * Atomically mint the next issue number for a board: bump Board.issueSeq and
 * return the new value. Runs inside the caller's transaction when given one so
 * the card insert and the counter bump commit together (no gaps/races). The
 * `update ... returning` is a single round-trip and serializes on the row.
 */
export async function nextIssueNumber(
  boardId: string,
  client: Pick<typeof db, "board"> = db,
): Promise<number> {
  const board = await client.board.update({
    where: { id: boardId },
    data: { issueSeq: { increment: 1 } },
    select: { issueSeq: true },
  });
  return board.issueSeq;
}
