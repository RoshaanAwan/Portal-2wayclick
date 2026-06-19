"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Zap, Users } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Logo } from "@/components/ui/Logo";

/* The branded left panel of the split login. A vibrant coral gradient with
   soft floating orbs, the brand mark, a headline, and a few value props.
   Hidden below the lg breakpoint — the form takes over on small screens. */
export function LoginHero() {
  const features = [
    { icon: Zap, label: "Fast, focused workspace" },
    { icon: Users, label: "Built for your whole team" },
    { icon: ShieldCheck, label: "Secure, role-based access" },
  ];

  // "Open on your phone" QR — encodes this site's URL so a desktop visitor can
  // jump to the portal on their phone. Resolved client-side from the live origin
  // (works across local/preview/prod without configuration).
  const [siteUrl, setSiteUrl] = useState("");
  useEffect(() => {
    setSiteUrl(window.location.origin);
  }, []);

  return (
    <div
      className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-between lg:p-14"
      style={{
        // ── Gradient base painted directly on the panel ── a rich diagonal
        // coral run. (Painting it here, rather than in a -z child, avoids the
        // negative-z layer rendering behind the page.)
        background:
          "linear-gradient(135deg, #ff8159 0%, #f5683f 45%, #e8542c 78%, #c8431f 100%)",
      }}
    >
      {/* Soft floating orbs add depth and motion over the flat gradient. */}
      <motion.div
        aria-hidden
        className="absolute -left-24 -top-24 z-0 h-96 w-96 rounded-full bg-white/20 blur-3xl"
        animate={{ y: [0, 24, 0], x: [0, 16, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -bottom-32 right-0 z-0 h-[28rem] w-[28rem] rounded-full bg-[#ffb38f]/30 blur-3xl"
        animate={{ y: [0, -28, 0], x: [0, -18, 0] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* A faint grid texture lifts the surface out of "flat fill" territory. */}
      <div
        aria-hidden
        className="absolute inset-0 z-0 opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)," +
            "linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(circle at 30% 20%, black, transparent 75%)",
        }}
      />

      {/* Brand mark. */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="relative z-10 flex items-center gap-3"
      >
        {/* Solid white chip: the logo is orange and the hero panel is an orange
            gradient, so a translucent box would let the mark blend in. */}
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white shadow-sm ring-1 ring-white/40">
          <Logo size="md" />
        </div>
        <span className="font-display text-lg font-semibold tracking-tight text-white">
          2WayClick
        </span>
      </motion.div>

      {/* Headline + value props. */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.1, ease: "easeOut" }}
        className="relative z-10 max-w-md"
      >
        <h2 className="font-display text-4xl font-semibold leading-[1.1] tracking-tight text-white">
          Everything your team needs, in one place.
        </h2>
        <p className="mt-4 text-[15px] leading-relaxed text-white/80">
          Projects, tasks, and tools — organized, fast, and built around the way
          you actually work.
        </p>

        <ul className="mt-9 space-y-3.5">
          {features.map(({ icon: Icon, label }, i) => (
            <motion.li
              key={label}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.25 + i * 0.1 }}
              className="flex items-center gap-3 text-white/90"
            >
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/15 ring-1 ring-white/20">
                <Icon className="h-4 w-4 text-white" strokeWidth={2.2} />
              </span>
              <span className="text-sm font-medium">{label}</span>
            </motion.li>
          ))}
        </ul>
      </motion.div>

      {/* Footer: brand QR + copyright. The QR encodes the site URL so a visitor
          on a desktop can open the portal on their phone by scanning it. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.6 }}
        className="relative z-10 flex items-center gap-4"
      >
        <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-white/40">
          {siteUrl ? (
            <QRCodeSVG
              value={siteUrl}
              size={60}
              level="M"
              marginSize={0}
              bgColor="#ffffff"
              fgColor="#181a1f"
            />
          ) : (
            <div className="h-[60px] w-[60px] animate-pulse rounded bg-zinc-100" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Open on your phone</p>
          <p className="mt-0.5 text-xs leading-relaxed text-white/70">
            Scan to launch 2WayClick on a mobile device.
          </p>
          <p className="mt-2 text-[11px] text-white/50">
            © {new Date().getFullYear()} 2WayClick. All rights reserved.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
