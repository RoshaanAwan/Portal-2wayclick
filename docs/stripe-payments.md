# Stripe payments for invoices

Lets a client pay an invoice online from its public share page
(`/invoices/shared/<token>`) using **Stripe Checkout** (Stripe's hosted payment
page). Cards never touch our servers, so PCI scope stays minimal.

Stripe is **optional**: with no keys set, the "Pay now" button doesn't appear and
invoices keep working (view / download / share). Test mode vs live mode is decided
solely by which secret key you set (`sk_test_…` vs `sk_live_…`).

## How it flows

```
Client opens /invoices/shared/<token>   (login-less, token is the only gate)
   │  clicks "Pay <amount>"
   ▼
POST /api/invoices/pay/<token>          creates a Stripe Checkout Session from
   │                                    the invoice's totalCents + currency
   ▼
Redirect to Stripe's hosted page        client enters card, 3DS, etc.
   │  on success Stripe redirects back to /invoices/shared/<token>?paid=1
   │
   ├─►  Stripe also POSTs an event ──►  POST /api/stripe/webhook
   │       (checkout.session.completed)    verifies signature, marks the invoice
   │                                        PAID, stamps paidAt + payment intent,
   │                                        notifies the invoice creator
   ▼
Share page shows a "Payment received" banner
```

The **webhook is the source of truth** for "paid", not the redirect — a client can
close the tab before the redirect lands, but the webhook still fires. The invoice
is only flipped to `PAID` in the webhook, and that flip is idempotent (keyed on the
invoice id in session metadata, and a no-op if already paid).

## One-time setup

1. **Get your API keys** — Stripe Dashboard → Developers → API keys. Copy the
   **Secret key** (`sk_test_…` while testing).

2. **Set env vars** (in `.env.local` for dev, Vercel env vars for prod):

   ```
   STRIPE_SECRET_KEY="sk_test_..."
   STRIPE_WEBHOOK_SECRET="whsec_..."   # from step 3/4
   ```

3. **Local testing — Stripe CLI** (recommended):

   ```
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook
   ```

   The `stripe listen` command prints a `whsec_…` — use it as
   `STRIPE_WEBHOOK_SECRET`. Keep it running while you test. Pay with test card
   **4242 4242 4242 4242**, any future expiry, any CVC.

4. **Production webhook** — Stripe Dashboard → Developers → Webhooks → Add endpoint:
   - URL: `https://YOUR_DOMAIN/api/stripe/webhook`
   - Events: `checkout.session.completed` and
     `checkout.session.async_payment_succeeded`
   - Copy the endpoint's **Signing secret** (`whsec_…`) into
     `STRIPE_WEBHOOK_SECRET` in your prod env.

5. **Go live** — swap `sk_test_…` → `sk_live_…` and use the live-mode webhook
   signing secret. Nothing else changes.

## Notes

- **Currency** — the invoice's `currency` is passed straight to Stripe. Make sure
  it's a currency your Stripe account is enabled for (e.g. PKR may need to be
  enabled in your Stripe settings).
- **Amounts** — invoices store integer minor units (cents), which is exactly what
  Stripe's `unit_amount` expects, so no conversion math and no rounding drift.
- **Idempotency** — Stripe delivers webhooks at least once; the handler is safe to
  receive duplicates.
- **Refunds / disputes** — handle these in the Stripe Dashboard. The invoice stores
  `stripePaymentIntentId` for reconciliation. (We don't auto-revert status on
  refund — add a `charge.refunded` handler later if you want that.)

## Files

| File | Role |
| --- | --- |
| `lib/stripe.ts` | lazy Stripe client + `isStripeConfigured()` |
| `app/api/invoices/pay/[token]/route.ts` | creates the Checkout Session |
| `app/api/stripe/webhook/route.ts` | verifies + marks the invoice paid |
| `app/invoices/shared/[token]/PayButton.tsx` | the client "Pay now" island |
