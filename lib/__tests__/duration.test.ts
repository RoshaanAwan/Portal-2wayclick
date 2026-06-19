// Run: npx tsx lib/__tests__/duration.test.ts
// A lightweight assertion harness (no framework) for the time-tracking
// duration helpers used by Trello card "time lock" / manual time entry.

import { formatMinutes, parseDuration } from "../utils";

let passed = 0;
let failed = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) {
    passed++;
  } else {
    failed++;
    console.error(`✗ ${name}\n    got:  ${g}\n    want: ${w}`);
  }
}

// ── formatMinutes ──
eq("formatMinutes 0", formatMinutes(0), "0m");
eq("formatMinutes 45", formatMinutes(45), "45m");
eq("formatMinutes 60", formatMinutes(60), "1h");
eq("formatMinutes 90", formatMinutes(90), "1h 30m");
eq("formatMinutes 150", formatMinutes(150), "2h 30m");
eq("formatMinutes 600", formatMinutes(600), "10h");
eq("formatMinutes rounds", formatMinutes(90.6), "1h 31m");
eq("formatMinutes clamps negative", formatMinutes(-5), "0m");
eq("formatMinutes undefined", formatMinutes(undefined), "0m");
eq("formatMinutes null", formatMinutes(null), "0m");
eq("formatMinutes NaN", formatMinutes(NaN), "0m");

// ── parseDuration: bare numbers (read as minutes) ──
eq("parseDuration bare", parseDuration("90"), 90);
eq("parseDuration bare decimal", parseDuration("90.4"), 90);

// ── parseDuration: hour/minute forms ──
eq("parseDuration 2h 30m", parseDuration("2h 30m"), 150);
eq("parseDuration 2h30m no space", parseDuration("2h30m"), 150);
eq("parseDuration 90m", parseDuration("90m"), 90);
eq("parseDuration 2h", parseDuration("2h"), 120);
eq("parseDuration 1.5h", parseDuration("1.5h"), 90);
eq("parseDuration uppercase", parseDuration("2H 30M"), 150);
eq("parseDuration whitespace", parseDuration("  1h  "), 60);

// ── parseDuration: rejects junk ──
eq("parseDuration empty", parseDuration(""), null);
eq("parseDuration blank", parseDuration("   "), null);
eq("parseDuration words", parseDuration("soon"), null);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
