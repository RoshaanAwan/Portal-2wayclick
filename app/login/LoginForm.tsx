"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Hexagon, Mail, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/Button";

const DEMO_ACCOUNTS = [
  { label: "CEO / Admin", email: "ava.chen@2wayclick.com" },
  { label: "VP Eng / Manager", email: "marcus.reyes@2wayclick.com" },
  { label: "Engineer", email: "diego.santos@2wayclick.com" },
];

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("ava.chen@2wayclick.com");
  const [password, setPassword] = useState("password123");
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
      <div className="mb-8 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 220 }}
          className="relative mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-accent-grad shadow-accent-glow"
        >
          <span className="absolute -inset-3 animate-breathe rounded-full bg-accent/40 blur-xl" />
          <Hexagon className="relative h-8 w-8 text-white" strokeWidth={2.4} />
        </motion.div>
        <h1 className="font-display text-[2rem] font-semibold tracking-tight text-ink">
          Welcome to 2WayClick
        </h1>
        <p className="mt-1.5 text-sm text-ink-500">
          Sign in to your company workspace
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

        <div className="mt-6 border-t border-line pt-5">
          <p className="mb-2.5 text-center text-xs text-ink-400">
            Quick demo login
          </p>
          <div className="grid grid-cols-3 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("password123");
                }}
                className="rounded-lg border border-line bg-surface-2 px-2 py-2 text-[11px] font-medium text-ink-500 transition hover:border-accent/30 hover:bg-accent-soft hover:text-accent-ink"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-ink-400">
        2WayClick — your company&apos;s internal hub
      </p>
    </motion.div>
  );
}
