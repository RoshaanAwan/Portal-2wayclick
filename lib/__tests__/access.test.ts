import { describe, it, expect } from "vitest";
import { computeTenantAccess } from "../access";

// Fixed "now" for deterministic day-math.
const NOW = new Date("2026-06-25T12:00:00.000Z").getTime();
const inDays = (d: number) => new Date(NOW + d * 86_400_000);

describe("computeTenantAccess", () => {
  it("grants access during the trial window and reports days left", () => {
    const a = computeTenantAccess(null, inDays(3), NOW);
    expect(a.hasAccess).toBe(true);
    expect(a.inTrial).toBe(true);
    expect(a.trialExpired).toBe(false);
    expect(a.trialDaysLeft).toBe(3);
  });

  it("rounds partial days up so 'today' still shows 1 day left", () => {
    const a = computeTenantAccess(null, new Date(NOW + 3 * 3_600_000), NOW); // +3h
    expect(a.inTrial).toBe(true);
    expect(a.trialDaysLeft).toBe(1);
  });

  it("CLOSES the gate once the trial has elapsed with no subscription", () => {
    const a = computeTenantAccess(null, inDays(-1), NOW);
    expect(a.hasAccess).toBe(false);
    expect(a.trialExpired).toBe(true);
    expect(a.inTrial).toBe(false);
    expect(a.trialDaysLeft).toBe(0);
  });

  it("treats the exact expiry instant as expired (msLeft === 0)", () => {
    const a = computeTenantAccess(null, new Date(NOW), NOW);
    expect(a.hasAccess).toBe(false);
    expect(a.trialExpired).toBe(true);
  });

  it("an active subscription supersedes an expired trial (full access, no banner)", () => {
    const a = computeTenantAccess("active", inDays(-5), NOW);
    expect(a.hasAccess).toBe(true);
    expect(a.inTrial).toBe(false);
    expect(a.trialExpired).toBe(false);
  });

  it("a trialing subscription counts as healthy", () => {
    const a = computeTenantAccess("trialing", null, NOW);
    expect(a.hasAccess).toBe(true);
    expect(a.inTrial).toBe(false);
  });

  it("past_due / canceled / unpaid are NOT healthy — gate follows the trial", () => {
    for (const status of ["past_due", "canceled", "unpaid", "incomplete"]) {
      // expired trial + unhealthy sub → no access
      expect(computeTenantAccess(status, inDays(-1), NOW).hasAccess).toBe(false);
      // active trial + unhealthy sub → still in trial
      expect(computeTenantAccess(status, inDays(2), NOW).inTrial).toBe(true);
    }
  });

  it("no trial window and no subscription is ungated (manual/legacy tenants)", () => {
    const a = computeTenantAccess(null, null, NOW);
    expect(a.hasAccess).toBe(true);
    expect(a.inTrial).toBe(false);
    expect(a.trialExpired).toBe(false);
    expect(a.trialDaysLeft).toBeNull();
  });
});
