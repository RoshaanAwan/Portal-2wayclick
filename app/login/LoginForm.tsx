"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Hexagon, Mail, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

export function LoginForm() {
  const router = useRouter();
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
      router.push("/dashboard");
      router.refresh();
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
        {/* Brand mark — centered on mobile (no hero), left-aligned on desktop. */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
          className="relative mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent-grad shadow-accent-glow lg:hidden"
        >
          <span className="absolute -inset-3 animate-breathe rounded-full bg-accent/40 blur-xl" />
          <Hexagon className="relative h-7 w-7 text-white" strokeWidth={2.4} />
        </motion.div>
        <h1 className="text-center font-display text-[1.85rem] font-semibold tracking-tight text-ink lg:text-left">
          Welcome back
        </h1>
        <p className="mt-1.5 text-center text-sm text-ink-500 lg:text-left">
          Sign in to your 2WayClick workspace
        </p>
      </div>

      <div className="glass-strong p-7">
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
                placeholder="you@2wayclick.com"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-ink-500">
              Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-300" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input pl-10"
                placeholder="••••••••"
              />
            </div>
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
      </div>

      <p className="mt-6 text-center text-xs text-ink-400">
        Trouble signing in? Contact your administrator.
      </p>
    </motion.div>
  );
}
