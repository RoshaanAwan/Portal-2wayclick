"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

// The logout control for the System Owner shell. Mirrors the tenant Topbar's
// logout exactly (POST /api/auth/logout → /login). It's a tiny client island so
// the surrounding (system) layout can stay a server component.
export function SystemLogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="nm-button inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-ink-500 transition hover:text-ink"
    >
      <LogOut className="h-3.5 w-3.5" />
      Logout
    </button>
  );
}
