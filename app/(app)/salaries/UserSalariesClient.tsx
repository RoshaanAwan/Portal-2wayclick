"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, FolderKanban } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  formatMoney,
  type SalariedUserDTO,
  type ProjectSalaryCostDTO,
} from "@/lib/userSalary";
import { UserSalaryGrid } from "./UserSalaryGrid";

interface ProjectOption {
  id: string;
  name: string;
}

export function UserSalariesClient({
  users,
  projects,
  projectCosts,
}: {
  users: SalariedUserDTO[];
  projects: ProjectOption[];
  projectCosts: ProjectSalaryCostDTO[];
}) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<SalariedUserDTO | null>(null);
  const [deleting, setDeleting] = useState(false);

  // People being added but not yet saved (a fresh editable row appears for each).
  const [drafts, setDrafts] = useState<string[]>([]);
  const [picker, setPicker] = useState("");

  // Rows = everyone WITH a salary, plus any draft (added via the picker).
  const salaried = useMemo(() => users.filter((u) => u.salary), [users]);
  const draftUsers = useMemo(
    () =>
      drafts
        .map((id) => users.find((u) => u.userId === id))
        .filter((u): u is SalariedUserDTO => !!u && !u.salary),
    [drafts, users],
  );
  const rows = useMemo(
    () => [...salaried, ...draftUsers],
    [salaried, draftUsers],
  );

  // Picker options: users with no salary and not already drafted.
  const draftSet = new Set(drafts);
  const addable = users.filter((u) => !u.salary && !draftSet.has(u.userId));

  function addPerson(userId: string) {
    if (!userId) return;
    setDrafts((d) => (d.includes(userId) ? d : [...d, userId]));
    setPicker("");
  }
  function dropDraft(userId: string) {
    setDrafts((d) => d.filter((x) => x !== userId));
  }

  async function confirmDelete() {
    if (!deleteTarget?.salary || deleting) return;
    setDeleting(true);
    const res = await fetch(`/api/user-salaries/${deleteTarget.salary.id}`, {
      method: "DELETE",
    });
    if (res.ok) {
      setDeleteTarget(null);
      router.refresh();
    }
    setDeleting(false);
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-ink-400">
          {salaried.length} {salaried.length === 1 ? "person" : "people"} with a
          salary set
        </span>
        {/* Add a person to set a salary for — picks from users without one. */}
        <label className="inline-flex items-center gap-2 text-sm">
          <UserPlus className="h-4 w-4 text-accent" />
          <select
            value={picker}
            onChange={(e) => addPerson(e.target.value)}
            disabled={addable.length === 0}
            className="input h-9 w-56 max-w-full"
          >
            <option value="">
              {addable.length === 0 ? "Everyone has a salary" : "Add a person…"}
            </option>
            {addable.map((u) => (
              <option key={u.userId} value={u.userId}>
                {u.userName}
                {u.userTitle ? ` — ${u.userTitle}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Project-cost rollup: what each project spends on salaries (the payoff of
          allocating). Read-only; reflects the last saved data. */}
      {projectCosts.length > 0 && <ProjectCostRollup costs={projectCosts} />}

      <UserSalaryGrid
        rows={rows.map((u) => ({ user: u, isDraft: !u.salary }))}
        projects={projects}
        onDelete={(u) => setDeleteTarget(u)}
        onCancelDraft={(userId) => dropDraft(userId)}
      />

      <ConfirmDialog
        open={!!deleteTarget?.salary}
        title="Remove salary"
        message={
          <>
            Remove <strong>{deleteTarget?.userName}</strong>’s monthly salary and
            all its project allocations? This can’t be undone.
          </>
        }
        confirmLabel="Remove"
        loading={deleting}
        onConfirm={confirmDelete}
        onClose={() => !deleting && setDeleteTarget(null)}
      />
    </>
  );
}

// ── Project-cost rollup ──────────────────────────────────────────────────────────
// Read-only summary of each project's monthly salary cost (sum of everyone's
// allocation to it), costliest first. Collapsible — it's secondary to editing.
function ProjectCostRollup({ costs }: { costs: ProjectSalaryCostDTO[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="mb-5 rounded-xl border border-line bg-surface-2/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-ink"
      >
        <FolderKanban className="h-4 w-4 text-accent" />
        Project salary costs
        <span className="text-xs font-normal text-ink-400">
          ({costs.length} {costs.length === 1 ? "project" : "projects"})
        </span>
        <span className="ml-auto text-xs text-ink-400">
          {open ? "Hide" : "Show"}
        </span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-line p-3 sm:grid-cols-2">
          {costs.map((c) => (
            <div
              key={c.projectId}
              className="rounded-lg border border-line bg-surface px-3 py-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-ink">{c.projectName}</span>
                <span className="font-semibold tabular-nums text-ink">
                  {formatMoney(c.totalCents, c.currency)}
                  <span className="text-xs font-normal text-ink-400">/mo</span>
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-ink-400">
                {c.contributors.map((p) => (
                  <span key={p.userId}>
                    {p.userName}{" "}
                    <span className="tabular-nums text-ink-500">
                      {formatMoney(p.cents, c.currency)}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
