import type { WorkflowStatus } from "@/lib/constants";

// Client-safe copy of the list-name → workflow-status mapping. The server
// authority lives in lib/issues.ts (statusForList), which is server-only; the
// board's optimistic status relocation needs the same rule in the browser. Keep
// the two tables in sync.
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

export function statusForListName(listName: string): WorkflowStatus {
  return LIST_NAME_TO_STATUS[listName.trim().toLowerCase()] ?? "TODO";
}
