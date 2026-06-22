/**
 * One-off: link Slack user IDs onto the matching portal User rows so the Slack
 * attendance webhook (POST /api/attendance/slack) can attribute check-in/out
 * events by slackUserId. See docs/slack-attendance.md.
 *
 * Matches each person by NAME (case-insensitive, trimmed) to resolve the portal
 * user ID, then writes by ID. Three Slack display names differ from the portal
 * names, so the mapping below is keyed on the PORTAL name as stored.
 *
 * Safety:
 *   • Dry-run by default. Pass --commit to actually write.
 *   • ALL-OR-NOTHING: if any name resolves to 0 or >1 users, or any Slack ID is
 *     already linked to a DIFFERENT user, it reports and writes NOTHING.
 *   • Writes in a single transaction.
 *   • Idempotent: a row already holding the right ID is left untouched.
 *
 * Run:
 *   npx tsx scripts/seed-slack-ids.ts            # dry-run (no writes)
 *   npx tsx scripts/seed-slack-ids.ts --commit   # apply
 *
 * IMPORTANT: this writes to whatever DATABASE_URL points at. To seed PRODUCTION,
 * run it ON the droplet (or with the prod DATABASE_URL exported), not against a
 * local dev DB.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

// Portal name (as stored) → Slack user ID. Keyed on the PORTAL name; the Slack
// display name / handle is noted where it differs so the mapping is auditable.
const MAPPING: { name: string; slackUserId: string; note?: string }[] = [
  { name: "Abaidullah Awan", slackUserId: "U0B9G8BDX8D", note: 'Slack display "Abaid Awan"' },
  { name: "Abdullah Awan", slackUserId: "U0BA3EE0GBU" },
  { name: "Bilal Gujjar", slackUserId: "U0B9QLCCJN9" },
  { name: "Hassan Asghar", slackUserId: "U0B9VRWE5T3" },
  { name: "Mubashar Hassan", slackUserId: "U0B9JC1SBK4" },
  { name: "Raza Awan", slackUserId: "U0B93LF2ZPZ", note: "portal name may be lowercase" },
  { name: "Roshaan Awan", slackUserId: "U0B93L3KB7H" },
  { name: "Talha Awan", slackUserId: "U0B9QET5020", note: 'Slack handle "talha.awan1668"' },
  { name: "Zaid Ali", slackUserId: "U0B9S7D2TV3" },
];

type Resolved = {
  name: string;
  slackUserId: string;
  note?: string;
  user: { id: string; name: string; email: string; slackUserId: string | null };
};

async function main() {
  const commit = process.argv.includes("--commit");
  console.log(
    `\n=== Slack ID seeding (${commit ? "COMMIT" : "DRY-RUN"}) ===\n`,
  );

  const resolved: Resolved[] = [];
  const problems: string[] = [];

  // 1) Resolve every name to exactly one portal user (case-insensitive).
  for (const m of MAPPING) {
    const matches = await db.user.findMany({
      where: { name: { equals: m.name, mode: "insensitive" } },
      select: { id: true, name: true, email: true, slackUserId: true },
    });
    if (matches.length === 0) {
      problems.push(`NO MATCH for "${m.name}"${m.note ? ` (${m.note})` : ""}`);
    } else if (matches.length > 1) {
      problems.push(
        `AMBIGUOUS "${m.name}" → ${matches.length} users: ${matches
          .map((u) => `${u.email} (${u.id})`)
          .join(", ")}`,
      );
    } else {
      resolved.push({ ...m, user: matches[0] });
    }
  }

  // 2) Detect Slack IDs already linked to a DIFFERENT user (unique-constraint clash).
  for (const r of resolved) {
    const holder = await db.user.findFirst({
      where: { slackUserId: r.slackUserId, NOT: { id: r.user.id } },
      select: { name: true, email: true },
    });
    if (holder) {
      problems.push(
        `CONFLICT: Slack ID ${r.slackUserId} (for ${r.name}) is already linked to ${holder.name} <${holder.email}>`,
      );
    }
  }

  // 3) Print the resolution table for the eyeball check.
  console.log("Resolved matches:");
  for (const r of resolved) {
    const current = r.user.slackUserId;
    const state =
      current === r.slackUserId
        ? "unchanged (already set)"
        : current
          ? `REPLACES existing ${current}`
          : "new";
    console.log(
      `  ${r.name.padEnd(18)} → ${r.user.email.padEnd(34)} ${r.user.id}  [${r.slackUserId}] ${state}` +
        (r.note ? `  // ${r.note}` : ""),
    );
  }

  // 4) All-or-nothing gate.
  if (problems.length > 0) {
    console.log(`\n✗ ${problems.length} problem(s) — writing NOTHING:\n`);
    problems.forEach((p) => console.log(`  - ${p}`));
    console.log(
      "\nResolve the above (check the portal name spelling / existing links) and re-run.\n",
    );
    process.exitCode = 1;
    return;
  }

  const toWrite = resolved.filter((r) => r.user.slackUserId !== r.slackUserId);
  console.log(
    `\nAll ${resolved.length} resolved cleanly. ${toWrite.length} need writing, ${
      resolved.length - toWrite.length
    } already correct.`,
  );

  if (!commit) {
    console.log("\nDRY-RUN — no changes made. Re-run with --commit to apply.\n");
    return;
  }

  // 5) Write in one transaction.
  await db.$transaction(
    toWrite.map((r) =>
      db.user.update({
        where: { id: r.user.id },
        data: { slackUserId: r.slackUserId, slackHandle: r.name },
      }),
    ),
  );
  console.log(`\n✓ Committed ${toWrite.length} update(s).\n`);
}

main()
  .catch((e) => {
    console.error("Seeding failed:", e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
