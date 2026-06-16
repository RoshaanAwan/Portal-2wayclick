"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Client island: kicks off Stripe Checkout for this invoice. POSTs to the pay
// route (keyed by the public token), then redirects the whole window to Stripe's
// hosted payment page. On failure it surfaces the server's message inline.
export function PayButton({
  token,
  amountLabel,
}: {
  token: string;
  amountLabel: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function pay() {
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/invoices/pay/${token}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        // Hand off to Stripe's hosted Checkout page.
        window.location.href = data.url;
        return; // keep the spinner while the browser navigates
      }
      setError(data.error || "Could not start payment. Please try again.");
    } catch {
      setError("Could not start payment. Please try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button size="md" onClick={pay} loading={loading}>
        {!loading && <CreditCard className="h-4 w-4" />}
        Pay {amountLabel}
      </Button>
      {error && <p className="text-xs text-danger-ink">{error}</p>}
    </div>
  );
}
