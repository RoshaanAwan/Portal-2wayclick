# Manual Test Plan — Stripe Subscription Packages

This covers the new **subscription billing** flow: a System Owner creates packages
(plans), a tenant's **Company Owner** subscribes via Stripe Checkout, and Stripe
webhooks sync the subscription state back (including auto-suspend on lapse).

It does **not** change the existing one-off invoice payment flow — that still works
as before.

---

## 0. One-time setup (do this first)

These tests need Stripe in **test mode**. If you only want to verify the UI and
gating without real Stripe, skip to the "Stripe NOT configured" cases (TC-1.7,
TC-3.6) — everything else needs Stripe keys.

1. In the project's environment (`.env` locally, or Vercel env in prod), set:
   - `STRIPE_SECRET_KEY=sk_test_...` (from the Stripe Dashboard → Developers → API keys, **Test mode**)
   - `STRIPE_WEBHOOK_SECRET=whsec_...` (see step 3)
2. Restart the dev server (`next dev`) so the new env + regenerated Prisma client load.
   - **Important:** a long-running dev server caches the old Prisma client; if `Plan`
     is "undefined" or you get 500s on the plans page, restart the server.
3. Forward Stripe webhooks to your local server in a separate terminal:
   ```
   stripe listen --forward-to http://localhost:3000/api/stripe/webhook
   ```
   Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET` and restart the server.
   - In production, instead add a webhook endpoint in the Stripe Dashboard pointing at
     `https://<your-domain>/api/stripe/webhook` and subscribe it to the events:
     `checkout.session.completed`, `customer.subscription.created`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
4. Have these logins ready:
   - **System Owner** — logs in at `system.<your-domain>` (e.g. `system.lvh.me:3000`).
   - **Company Owner** of a test tenant — logs in at `<subdomain>.<your-domain>`
     (e.g. `acme.lvh.me:3000`). This is the tenant's first SUPER_ADMIN.
   - **A non-owner Admin** in the same tenant (create one if needed) — to verify gating.
5. Stripe test card for all payments: **`4242 4242 4242 4242`**, any future expiry,
   any 3-digit CVC, any ZIP.

---

## Section 1 — System Owner: create & manage packages

### TC-1.1 — Plans page is reachable and gated to the System Owner
1. Log in as the **System Owner** at `system.<domain>`.
2. You land on the System shell. In the **left sidebar**, under "Platform", click **Plans**
   (between "Tenants" and "Announcements", package icon).
3. **Expect:** the **Plans** page loads with the header "Plans" and subtitle
   "Create the subscription packages your tenants can subscribe to." If no plans exist
   yet, you see an empty-state card "No plans yet…".

### TC-1.2 — Create a sellable plan
1. On **/system/plans**, click **New plan** (top right).
2. A modal opens. Fill in:
   - **Plan name:** `Starter`
   - **Description:** `For small teams`
   - **Price:** `29`
   - **Currency:** `usd`
   - **Billing interval:** `Monthly`
   - **Free trial (days):** `0`
   - **Max users:** `5`
   - **Features (one per line):**
     ```
     Unlimited projects
     Email support
     ```
3. Click **Create plan**.
4. **Expect:** modal closes; a plan card "Starter" appears showing **$29.00/month**,
   "Up to 5 users", and the two feature bullets. It shows "0 tenants subscribed".
   There is **no** "Not sellable" badge (Stripe created the product/price).
5. **Verify in Stripe Dashboard** (Test mode → Products): a product "Starter" with a
   recurring $29.00/month price now exists.

### TC-1.3 — Create a plan with a free trial
1. **New plan** again. Name `Pro`, Price `99`, interval **Monthly**, **Free trial (days):** `14`,
   **Max users:** blank (unlimited), features `Priority support`.
2. Click **Create plan**.
3. **Expect:** a "Pro" card showing **$99.00/month**, "Unlimited users", and "14-day free trial".

### TC-1.4 — Edit a plan's non-price fields
1. On the **Starter** card, click **Edit**.
2. Change **Description** to `For small & growing teams` and add a feature line `Mobile app`.
   Leave the price at `29`.
3. Click **Save changes**.
4. **Expect:** modal closes; the Starter card shows the new description and the extra
   feature bullet. Price is unchanged. (No new Stripe price is created — verify in
   Stripe the product still has one active price.)

### TC-1.5 — Edit a plan's price (creates a new Stripe price)
1. On the **Starter** card, click **Edit**, change **Price** from `29` to `39`.
2. **Expect (before saving):** an amber note appears: "Changing the price creates a new
   Stripe price. Tenants already subscribed keep their current price until they re-subscribe."
3. Click **Save changes**.
4. **Expect:** Starter card now shows **$39.00/month**.
5. **Verify in Stripe** (Product "Starter" → Pricing): there are now **two** prices — the
   old $29 price is **archived/inactive**, the new $39 price is **active**.

### TC-1.6 — Archive and restore a plan
1. On the **Pro** card, click **Archive**.
2. **Expect:** the Pro card dims and shows an "Archived" badge; its buttons now offer **Restore**.
3. Click **Restore** on the Pro card.
4. **Expect:** the card returns to normal (no Archived badge), buttons offer **Archive** again.
5. **Verify in Stripe:** archiving set the product to inactive; restoring re-activated it.

### TC-1.7 — Stripe not configured (draft-only behavior)
> Only run if you want to confirm the no-Stripe path. Temporarily unset
> `STRIPE_SECRET_KEY` and restart the server.
1. Go to **/system/plans**.
2. **Expect:** an amber banner at the top: "Stripe isn't configured … You can draft plans,
   but they won't be subscribable until Stripe is set up and the plan is re-saved."
3. Create a plan `Draft`. **Expect:** the card appears with a **"Not sellable"** amber badge.
4. Re-set `STRIPE_SECRET_KEY`, restart, open the `Draft` plan's **Edit** and **Save changes**.
   **Expect:** the "Not sellable" badge disappears (Stripe product/price now created).

### TC-1.8 — Audit trail for plan actions
1. (After creating/editing plans above) Confirm the platform records the actions.
2. **Expect:** plan create/update/archive each write a platform audit entry attributed to
   the System Owner (visible wherever the system/platform log is surfaced).

---

## Section 2 — Tenant Company Owner: subscribe

### TC-2.1 — Billing page is reachable and Company-Owner-only
1. Log in as the tenant's **Company Owner** at `<subdomain>.<domain>` (e.g. `acme.lvh.me:3000`).
2. From the **Dashboard**, look at the **left sidebar**. Scroll to the admin section
   (below the main nav). Click **Billing** (credit-card icon).
3. **Expect:** the **Billing** page loads with header "Billing" / "Manage your workspace
   subscription." You see a "Current plan: No plan" summary card and the catalog of
   sellable plans (Starter, Pro) as cards with **Subscribe** / **Start free trial** buttons.

### TC-2.2 — Non-owner Admin cannot see or reach Billing
1. Log in as the **non-owner Admin** in the same tenant.
2. **Expect:** there is **no "Billing"** link in the sidebar.
3. Manually navigate to `<subdomain>.<domain>/billing`.
4. **Expect:** you are redirected to **/dashboard** (Billing is SUPER_ADMIN/Company-Owner only).

### TC-2.3 — Subscribe to a no-trial plan (happy path)
1. As **Company Owner**, on **/billing**, on the **Starter** card click **Subscribe**.
2. **Expect:** you are redirected to a **Stripe Checkout** hosted page showing Starter at
   the current price, billed monthly.
3. Pay with test card **`4242 4242 4242 4242`** (any future expiry/CVC/ZIP) and confirm.
4. **Expect:** Stripe redirects you back to **/billing?status=success** showing a green
   "Thanks! Your subscription is being activated…" banner.
5. Within a few seconds (and after a page refresh if needed) **Expect** the "Current plan"
   card to show **Starter** with an **Active** badge and a "Renews <date>" line. The
   Starter card in the catalog now shows a **Current** badge and its button reads
   "Current plan" (disabled).
6. **Verify** the `stripe listen` terminal logged `checkout.session.completed` and
   `customer.subscription.created`/`updated` returning `200`.

### TC-2.4 — Subscribe to a trial plan
1. As Company Owner (use a **different** test tenant, or first cancel via TC-4.2), on
   **/billing** click **Start free trial** on the **Pro** card.
2. Complete Stripe Checkout with the test card.
3. **Expect:** back on /billing the "Current plan" shows **Pro** with a **Trial** badge,
   and the date line reads "Renews <14 days out>". No charge is shown yet in Stripe
   (it's a trial).

### TC-2.5 — Cancel checkout (no charge)
1. On **/billing**, click **Subscribe** on any plan to reach Stripe Checkout.
2. Click the browser **back** button (or Stripe's back arrow) to abandon, landing on
   **/billing?status=canceled**.
3. **Expect:** a neutral banner "Checkout canceled — no charge was made." The Current plan
   is unchanged. No subscription was created in Stripe.

### TC-2.6 — Manage subscription via the Stripe Billing Portal
1. As a Company Owner who **has** an active subscription (after TC-2.3), on **/billing**
   click **Manage subscription** (top-right of the Current plan card).
2. **Expect:** you are redirected to the **Stripe Billing Portal** where you can update the
   payment method, view past invoices, and cancel.
3. Click the portal's **Return** link.
4. **Expect:** you land back on **/billing**.

---

## Section 3 — Plan seat limit (maxUsers)

> Uses the **Starter** plan (maxUsers = 5). Make sure the test tenant is subscribed to
> Starter (TC-2.3) and currently has **fewer than 5** non-owner users.

### TC-3.1 — Adding users is allowed under the cap
1. As **Company Owner** (or an Admin), from the Dashboard sidebar open **Users**
   (under the admin section) → **/admin/users**.
2. Add new users one at a time until the tenant has **exactly 5** users total.
3. **Expect:** each creation succeeds while under the cap.

### TC-3.2 — Adding a user at the cap is blocked
1. With the tenant now at **5** users (the Starter cap), try to create one **more** user.
2. **Expect:** creation fails with an error like: "Your plan allows up to 5 users (you have 5).
   Upgrade your plan to add more." No user is created.

### TC-3.3 — Raising the cap unblocks it
1. As **System Owner** on /system/plans, **Edit** Starter and set **Max users** to `10`,
   save.
2. Back as the **Company Owner**, retry creating the user from TC-3.2.
3. **Expect:** creation now succeeds.

### TC-3.4 — Unlimited plan has no cap
1. Subscribe a tenant to **Pro** (maxUsers blank = unlimited), or temporarily set the
   tenant's plan to one with no cap.
2. Create several users.
3. **Expect:** no seat-limit error regardless of count.

### TC-3.5 — Tenant with no plan is not limited
1. Use a tenant that has **never subscribed** (Current plan = "No plan").
2. Create users.
3. **Expect:** no seat-limit error (the cap only applies once a capped plan is active).

---

## Section 4 — Subscription lifecycle & auto-suspend (webhooks)

> These verify the webhook is the source of truth and that a lapse suspends the tenant.
> Easiest to drive from the Stripe Dashboard (Test mode) or `stripe` CLI.

### TC-4.1 — Renewal / status updates sync
1. Tenant is subscribed and **Active** (TC-2.3).
2. In Stripe (Test mode), the subscription will renew automatically; or trigger an update
   event. Reload **/billing**.
3. **Expect:** the "Renews <date>" line and **Active** badge stay correct after updates.

### TC-4.2 — Cancel → tenant auto-suspended
1. As Company Owner, open the **Billing Portal** (TC-2.6) and **cancel the subscription
   immediately** (not "at period end") — or in the Stripe Dashboard, cancel the test
   subscription now.
2. Wait for the `customer.subscription.deleted` (or `.updated` to `canceled`) webhook to
   process (watch the `stripe listen` terminal for a `200`).
3. **Expect:** the tenant is **auto-suspended**. Visit any tenant page (e.g.
   `<subdomain>.<domain>/dashboard`) — you are sent to the **/suspended** page, and login
   to that subdomain is blocked at middleware.
4. **Verify:** the platform audit log shows a `subscription.sync` entry noting `canceled`
   and suspended=true.

### TC-4.3 — Past-due also suspends
1. (Optional, advanced) Force a renewal payment to fail in Stripe test mode (use a card
   that fails on renewal, or trigger `customer.subscription.updated` with status
   `past_due` via the CLI: `stripe trigger customer.subscription.updated`).
2. **Expect:** on a `past_due` (or `unpaid`) status, the tenant is suspended the same way
   as TC-4.2.

### TC-4.4 — Recovery reactivates the tenant
1. With a tenant suspended from TC-4.2/4.3, resolve billing in the Stripe Billing Portal /
   Dashboard so the subscription returns to **active** (e.g. add a valid payment method and
   pay the past-due invoice, or start a fresh subscription).
2. Wait for the `customer.subscription.updated` → `active` webhook.
3. **Expect:** the tenant is **reactivated** automatically — `<subdomain>.<domain>/dashboard`
   loads normally again, and login works. /billing shows **Active**.

### TC-4.5 — System Owner manual suspend still works independently
1. As **System Owner** on /system/tenants, **Suspend** a tenant manually.
2. **Expect:** tenant is suspended regardless of subscription status (the existing manual
   control is unchanged). Reactivating it manually also still works.

---

## Section 5 — Webhook security & isolation (regression)

### TC-5.1 — Forged webhook is rejected
1. `POST` a body to `/api/stripe/webhook` with no/invalid `stripe-signature` header
   (e.g. `curl -X POST http://localhost:3000/api/stripe/webhook -d '{}'`).
2. **Expect:** **400** "Invalid signature" / "Missing signature". No DB change.

### TC-5.2 — Existing invoice payment flow still works
1. As a tenant Admin, create and share an **invoice** (existing feature), open the public
   share link, and pay it with the test card.
2. **Expect:** the invoice flips to **PAID** exactly as before — the subscription changes
   did **not** break one-off invoice payments. (This confirms the webhook's `mode`
   branching is correct.)

### TC-5.3 — Tenant isolation of subscription state
1. Subscribe **Tenant A** to a plan. Log in as **Tenant B**'s Company Owner.
2. **Expect:** Tenant B's /billing shows **its own** state ("No plan" if it never
   subscribed) — never Tenant A's plan/subscription.

---

## Quick pass/fail summary sheet

| TC | Area | Pass? |
|------|------|-------|
| 1.1 | Plans page gated to System Owner | |
| 1.2 | Create sellable plan (+ Stripe product/price) | |
| 1.3 | Create trial plan | |
| 1.4 | Edit non-price fields (no new price) | |
| 1.5 | Edit price (new Stripe price, old archived) | |
| 1.6 | Archive / restore plan | |
| 1.7 | Stripe-not-configured draft behavior | |
| 1.8 | Plan actions audited | |
| 2.1 | Billing page reachable (Company Owner) | |
| 2.2 | Non-owner Admin blocked from Billing | |
| 2.3 | Subscribe (no trial) happy path | |
| 2.4 | Subscribe (trial) | |
| 2.5 | Cancel checkout, no charge | |
| 2.6 | Billing Portal opens & returns | |
| 3.1 | Add users under cap | |
| 3.2 | Blocked at cap | |
| 3.3 | Raising cap unblocks | |
| 3.4 | Unlimited plan no cap | |
| 3.5 | No-plan tenant not limited | |
| 4.1 | Status updates sync | |
| 4.2 | Cancel → auto-suspend | |
| 4.3 | Past-due → suspend | |
| 4.4 | Recovery → reactivate | |
| 4.5 | Manual suspend independent | |
| 5.1 | Forged webhook rejected | |
| 5.2 | Invoice payment still works | |
| 5.3 | Tenant isolation | |
