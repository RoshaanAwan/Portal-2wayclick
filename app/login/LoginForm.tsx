"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, ArrowRight } from "lucide-react";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { useBrand } from "@/components/BrandProvider";

// Only allow same-site relative redirects (no protocol/host) to avoid an
// open-redirect via the ?next= param.
function safeNext(next: string | null): string {
  if (next && next.startsWith("/") && !next.startsWith("//")) return next;
  return "/dashboard";
}

export function LoginForm() {
  const searchParams = useSearchParams();
  const brand = useBrand();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      // Hard navigation (not router.push) so the server runs the (app) layout's
      // gate fresh: a tenant whose trial has lapsed is 307'd to /trial-ended by
      // the server with no client-router limbo and no flash of /dashboard. A
      // soft push + refresh races that server redirect and can hang the router.
      window.location.assign(safeNext(searchParams.get("next")));
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Login failed");
      setLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="w-full max-w-md"
    >
      <div className="mb-8">
        {/* Brand mark — only on small screens, where the gradient hero panel
            (which carries the brand) is hidden. */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
          className="relative mb-5 lg:hidden"
        >
          <Logo size="lg" logoUrl={brand.logoUrl} name={brand.name} />
        </motion.div>
        <h1 className="font-display text-[2rem] font-semibold tracking-tight text-ink">
          Welcome{" "}
          <span className="bg-gradient-to-r from-accent-400 to-accent-600 bg-clip-text text-transparent">
            back
          </span>
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Sign in to your {brand.name} workspace
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="input pl-10"
              placeholder={`you@${brand.emailDomain}`}
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-500">
            Password
          </label>
          <PasswordInput
            leadingIcon={
              <Lock className="absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-ink-300" />
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            placeholder="••••••••"
          />
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-sm text-danger-ink"
          >
            {error}
          </motion.p>
        )}

        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>

      <p className="mt-6 text-xs text-ink-400">
        Trouble signing in? Contact your administrator.
      </p>
    </motion.div>
  );
}
