# 2WayClick — Immersive Company Portal

A fully operational **internal employee hub** with an immersive glassmorphic UI.
Real authentication, a real database, a real API — all running locally with **zero external keys**.

![stack](https://img.shields.io/badge/Next.js-14-black) ![db](https://img.shields.io/badge/Prisma-SQLite-blue) ![ui](https://img.shields.io/badge/Framer_Motion-glass-7c5cff)

## ✨ What's inside

- **Glassmorphic, animated UI** — frosted glass surfaces, animated mesh-gradient backdrop, floating orbs, Framer Motion throughout.
- **Real auth** — bcrypt password hashing, httpOnly session cookies, server-side route protection.
- **Dashboard** — personalized greeting, animated stat tiles, live activity pulse, headcount chart, pinned posts, your team.
- **Announcements** — company feed with categories, emoji reactions, threaded comments, pin/compose (role-gated).
- **Directory** — searchable people grid + org chart, rich profile pages with reporting lines.
- **Documents** — file library with type-aware icons, categories, grid/list views, upload.
- **Time Off** — request leave, manager approvals workflow, status tracking.
- **Tools** — app launchpad, quick links, and an interactive focus timer.

## 🚀 Run it

```bash
npm install
npm run setup     # generates Prisma client, creates SQLite DB, seeds demo data
npm run dev       # http://localhost:3000
```

> `npm run setup` is a one-time step. To wipe and reseed later: `npm run db:reset`.

<details>
<summary><strong>Dev server restart-loops or won't respond? (Linux file-watcher limit)</strong></summary>

On some Linux boxes `next dev` floods with `ENOSPC: System limit for number of file watchers reached` and restart-loops. Raise the limit:

```bash
echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p
```

Or just run the production server (no file watching):

```bash
npm run build && npm start
```
</details>

## 🔑 Demo logins

All accounts use password **`password123`**:

| Email                        | Role            |
| ---------------------------- | --------------- |
| `ava.chen@2wayclick.com`     | Admin / CEO     |
| `marcus.reyes@2wayclick.com` | Manager / VP Eng|
| `diego.santos@2wayclick.com` | Employee        |

(Or click a quick-login chip on the sign-in screen.)

## 🧱 Architecture

```
app/
  (app)/                 # authenticated route group (shares Sidebar + Topbar shell)
    dashboard/           # home
    announcements/       # company feed
    directory/[id]/      # people + profiles
    documents/           # file library
    requests/            # time-off
    tools/               # launchpad
  api/                   # route handlers (auth + feature mutations)
  login/                 # public sign-in
components/
  ui/                    # GlassCard, Avatar, Badge, Button, PageHeader, EmptyState
lib/
  auth.ts db.ts utils.ts constants.ts
prisma/
  schema.prisma seed.ts
```

- **Server Components** fetch data directly via Prisma; **Client Components** handle interactivity and POST to route handlers, then `router.refresh()`.
- SQLite for zero-config local dev (string-based enums since SQLite lacks native enum support — see `lib/constants.ts`).

## 🎨 Design system

Defined in `tailwind.config.ts` + `app/globals.css`: a deep-space base palette, electric accent/cyan/pink/emerald glows, `.glass*` surface utilities, gradient text, and reusable keyframe animations.
