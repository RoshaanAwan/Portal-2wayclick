import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// Roles as string literals (see lib/permissions.ts for the canonical list).
const Role = {
  SUPER_ADMIN: "SUPER_ADMIN",
  ADMIN: "ADMIN",
  HR: "HR",
  LEAD: "LEAD",
  PROJECT_MANAGER: "PROJECT_MANAGER",
  EMPLOYEE: "EMPLOYEE",
  INTERN: "INTERN",
} as const;
const RequestStatus = { PENDING: "PENDING", APPROVED: "APPROVED", DENIED: "DENIED" } as const;

const db = new PrismaClient();

// Deterministic helpers (no Math.random for reproducible seeds)
function daysAgo(n: number) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function daysFromNow(n: number) {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("🌱 Seeding 2WayClick portal...");

  // Wipe (order matters for FKs)
  await db.projectMember.deleteMany();
  await db.project.deleteMany();
  await db.taskComment.deleteMany();
  await db.taskAssignee.deleteMany();
  await db.task.deleteMany();
  await db.boardList.deleteMany();
  await db.board.deleteMany();
  await db.activity.deleteMany();
  await db.reaction.deleteMany();
  await db.comment.deleteMany();
  await db.announcementRead.deleteMany();
  await db.announcement.deleteMany();
  await db.document.deleteMany();
  await db.leaveRequest.deleteMany();
  await db.session.deleteMany();
  await db.user.deleteMany();

  const pw = await bcrypt.hash("password123", 10);

  const people = [
    // Dedicated platform owner — full access + all audit logs.
    { name: "Root Admin", title: "Platform Owner", department: "Executive", role: Role.SUPER_ADMIN, location: "Remote", avatar: 1 },
    { name: "Ava Chen", title: "CEO", department: "Executive", role: Role.SUPER_ADMIN, location: "San Francisco", avatar: 12 },
    { name: "Marcus Reyes", title: "VP Engineering", department: "Engineering", role: Role.ADMIN, location: "Austin", avatar: 13 },
    { name: "Priya Nair", title: "Head of People", department: "People", role: Role.HR, location: "Remote", avatar: 5 },
    { name: "Diego Santos", title: "Staff Engineer", department: "Engineering", role: Role.LEAD, location: "Austin", avatar: 14 },
    { name: "Lena Park", title: "Product Designer", department: "Design", role: Role.EMPLOYEE, location: "Seattle", avatar: 9 },
    { name: "Omar Haddad", title: "Backend Engineer", department: "Engineering", role: Role.EMPLOYEE, location: "Remote", avatar: 15 },
    { name: "Sofia Rossi", title: "Marketing Lead", department: "Marketing", role: Role.LEAD, location: "New York", avatar: 16 },
    { name: "Jamal Wright", title: "Data Analyst", department: "Data", role: Role.EMPLOYEE, location: "Chicago", avatar: 17 },
    { name: "Yuki Tanaka", title: "Frontend Engineer", department: "Engineering", role: Role.EMPLOYEE, location: "Remote", avatar: 18 },
    { name: "Grace Okoro", title: "Finance Manager", department: "Finance", role: Role.PROJECT_MANAGER, location: "London", avatar: 19 },
    { name: "Tom Becker", title: "Sales Director", department: "Sales", role: Role.PROJECT_MANAGER, location: "Boston", avatar: 11 },
    { name: "Nadia Volkov", title: "UX Researcher", department: "Design", role: Role.EMPLOYEE, location: "Berlin", avatar: 20 },
    { name: "Leo Martin", title: "Engineering Intern", department: "Engineering", role: Role.INTERN, location: "Remote", avatar: 21 },
  ];

  const created: Record<string, string> = {};
  let i = 0;
  for (const p of people) {
    const email = p.name.toLowerCase().replace(" ", ".") + "@2wayclick.com";
    const u = await db.user.create({
      data: {
        email,
        passwordHash: pw,
        name: p.name,
        title: p.title,
        department: p.department,
        role: p.role,
        location: p.location,
        avatarUrl: `https://i.pravatar.cc/200?img=${p.avatar}`,
        phone: `+1 (555) ${100 + i}-${1000 + i}`,
        bio: `${p.title} at 2WayClick. Passionate about building great products and a great team.`,
        startDate: daysAgo(400 - i * 25),
      },
    });
    created[p.name] = u.id;
    i++;
  }

  // Reporting structure
  await db.user.update({ where: { id: created["Marcus Reyes"] }, data: { managerId: created["Ava Chen"] } });
  await db.user.update({ where: { id: created["Priya Nair"] }, data: { managerId: created["Ava Chen"] } });
  await db.user.update({ where: { id: created["Diego Santos"] }, data: { managerId: created["Marcus Reyes"] } });
  await db.user.update({ where: { id: created["Omar Haddad"] }, data: { managerId: created["Marcus Reyes"] } });
  await db.user.update({ where: { id: created["Yuki Tanaka"] }, data: { managerId: created["Marcus Reyes"] } });
  await db.user.update({ where: { id: created["Lena Park"] }, data: { managerId: created["Priya Nair"] } });

  const ava = created["Ava Chen"];
  const priya = created["Priya Nair"];
  const marcus = created["Marcus Reyes"];
  const sofia = created["Sofia Rossi"];

  // Announcements
  const announcements = [
    { title: "🚀 2WayClick 3.0 ships next Friday", body: "After six months of work, our biggest release yet goes live next Friday. The new collaboration engine, real-time sync, and redesigned dashboard are all included. Huge thanks to Engineering and Design for the relentless push. Launch party in the SF office at 5pm — remote folks, we'll have a stream.", category: "Product", pinned: true, coverColor: "accent", author: marcus, days: 1 },
    { title: "Welcome our new teammates 👋", body: "Please give a warm welcome to the four engineers and two designers joining us this month. Their intros are posted in the directory — drop by and say hi. We're now 120 people strong across 8 countries.", category: "People", pinned: true, coverColor: "emerald", author: priya, days: 2 },
    { title: "Updated remote work policy", body: "Effective this quarter, all employees may work remotely up to 3 days per week, with core collaboration hours from 10am–2pm in your local time. Full policy doc is in the Documents section under HR.", category: "Policy", pinned: false, coverColor: "cyan", author: priya, days: 4 },
    { title: "Q3 all-hands recap & deck", body: "Thanks to everyone who joined Tuesday's all-hands. We hit 142% of our revenue target and shipped 31 features. The recording and deck are now available. Key theme for Q4: depth over breadth.", category: "General", pinned: false, coverColor: "pink", author: ava, days: 6 },
    { title: "Brand refresh — new guidelines live", body: "Our refreshed brand system is live: new logo lockups, a tighter color palette, and updated templates for decks and docs. Marketing has posted everything to the Brand folder. Please migrate active materials by end of month.", category: "General", pinned: false, coverColor: "accent", author: sofia, days: 9 },
    { title: "Office closed for the holiday Monday", body: "A reminder that all offices will be closed Monday for the public holiday. Support coverage continues via the on-call rotation. Enjoy the long weekend!", category: "Event", pinned: false, coverColor: "cyan", author: priya, days: 12 },
  ];

  const annIds: string[] = [];
  for (const a of announcements) {
    const ann = await db.announcement.create({
      data: {
        title: a.title, body: a.body, category: a.category, pinned: a.pinned,
        coverColor: a.coverColor, authorId: a.author, createdAt: daysAgo(a.days),
      },
    });
    annIds.push(ann.id);
  }

  // Reactions + comments + reads on the first couple posts
  const emojis = ["🎉", "🔥", "❤️", "👏", "🚀"];
  const userIds = Object.values(created);
  for (let a = 0; a < 3; a++) {
    for (let r = 0; r < 5 + a; r++) {
      await db.reaction.create({
        data: { emoji: emojis[r % emojis.length], announcementId: annIds[a], userId: userIds[(r + a) % userIds.length] },
      }).catch(() => {});
    }
    const comments = [
      "This is huge — congrats team! 🎉",
      "Been waiting for this. Amazing work everyone.",
      "Love the direction. Counting down the days.",
      "Proud of what we built here.",
    ];
    for (let c = 0; c < 2 + a; c++) {
      await db.comment.create({
        data: { body: comments[c % comments.length], announcementId: annIds[a], authorId: userIds[(c + a + 2) % userIds.length], createdAt: daysAgo(annIds.length - a) },
      });
    }
    for (let u = 0; u < userIds.length - 2; u++) {
      await db.announcementRead.create({
        data: { announcementId: annIds[a], userId: userIds[u] },
      }).catch(() => {});
    }
  }

  // Documents
  const docs = [
    { title: "Employee Handbook 2026", description: "Everything you need to know about working at 2WayClick.", category: "HR", fileType: "pdf", sizeKb: 2400, uploader: priya },
    { title: "Remote Work Policy", description: "Updated hybrid work guidelines and core hours.", category: "HR", fileType: "doc", sizeKb: 180, uploader: priya },
    { title: "Engineering Onboarding Guide", description: "Dev environment setup, codebase tour, and norms.", category: "Engineering", fileType: "doc", sizeKb: 540, uploader: marcus },
    { title: "Architecture Decision Records", description: "ADRs for the platform and services.", category: "Engineering", fileType: "pdf", sizeKb: 1200, uploader: marcus },
    { title: "Q3 Financial Report", description: "Revenue, burn, and runway through Q3.", category: "Finance", fileType: "sheet", sizeKb: 320, uploader: created["Grace Okoro"] },
    { title: "Brand Guidelines v2", description: "Logo, color, typography, and voice.", category: "Brand", fileType: "slide", sizeKb: 8800, uploader: sofia },
    { title: "Master Services Agreement", description: "Standard MSA template for enterprise deals.", category: "Legal", fileType: "pdf", sizeKb: 410, uploader: ava },
    { title: "2026 Benefits Overview", description: "Health, dental, equity, and perks summary.", category: "HR", fileType: "pdf", sizeKb: 690, uploader: priya },
  ];
  for (const d of docs) {
    await db.document.create({
      data: { title: d.title, description: d.description, category: d.category, fileType: d.fileType, sizeKb: d.sizeKb, uploaderId: d.uploader, createdAt: daysAgo(15 + docs.indexOf(d)) },
    });
  }

  // Leave requests
  const leave = [
    { type: "Vacation", owner: created["Diego Santos"], start: 10, end: 17, status: RequestStatus.PENDING, reviewer: marcus, reason: "Family trip" },
    { type: "WFH", owner: created["Yuki Tanaka"], start: 1, end: 1, status: RequestStatus.APPROVED, reviewer: marcus, reason: "Deliveries" },
    { type: "Sick", owner: created["Lena Park"], start: -2, end: -1, status: RequestStatus.APPROVED, reviewer: priya, reason: "Flu" },
    { type: "Personal", owner: created["Omar Haddad"], start: 5, end: 5, status: RequestStatus.PENDING, reviewer: marcus, reason: "Appointment" },
    { type: "Vacation", owner: created["Jamal Wright"], start: 20, end: 27, status: RequestStatus.DENIED, reviewer: marcus, reason: "Conflicts with release" },
  ];
  for (const l of leave) {
    await db.leaveRequest.create({
      data: {
        type: l.type, ownerId: l.owner, reviewerId: l.reviewer, reason: l.reason, status: l.status,
        startDate: l.start >= 0 ? daysFromNow(l.start) : daysAgo(-l.start),
        endDate: l.end >= 0 ? daysFromNow(l.end) : daysAgo(-l.end),
        decidedAt: l.status === RequestStatus.PENDING ? null : daysAgo(3),
        createdAt: daysAgo(5),
      },
    });
  }

  // Activity feed
  const acts = [
    { user: marcus, verb: "posted", target: "2WayClick 3.0 ships next Friday", days: 1 },
    { user: priya, verb: "posted", target: "Welcome our new teammates", days: 2 },
    { user: created["Yuki Tanaka"], verb: "requested", target: "WFH day", days: 2 },
    { user: marcus, verb: "approved", target: "Yuki's WFH request", days: 1 },
    { user: created["Grace Okoro"], verb: "uploaded", target: "Q3 Financial Report", days: 3 },
    { user: sofia, verb: "uploaded", target: "Brand Guidelines v2", days: 4 },
    { user: created["Nadia Volkov"], verb: "joined", target: "the Design team", days: 5 },
    { user: created["Diego Santos"], verb: "commented", target: "2WayClick 3.0 announcement", days: 1 },
  ];
  for (const ac of acts) {
    await db.activity.create({
      data: { userId: ac.user, verb: ac.verb, target: ac.target, createdAt: daysAgo(ac.days) },
    });
  }

  // ── Task board (Trello-style) ────────────────────────────────────────────
  const board = await db.board.create({
    data: { name: "2WayClick 3.0 Launch", createdAt: daysAgo(20) },
  });

  const listDefs = ["Backlog", "To Do", "In Progress", "Review", "Done"];
  const listIds: Record<string, string> = {};
  for (let l = 0; l < listDefs.length; l++) {
    const list = await db.boardList.create({
      data: { name: listDefs[l], position: l * 1000, boardId: board.id },
    });
    listIds[listDefs[l]] = list.id;
  }

  // Each task: which list, title, priority, due offset (days from now, null = none),
  // creator, and the members assigned to it.
  const tasks = [
    { list: "Backlog", title: "Audit legacy onboarding flow", priority: "LOW", due: null, creator: priya, members: ["Lena Park", "Nadia Volkov"] },
    { list: "Backlog", title: "Spike: real-time presence indicators", priority: "MEDIUM", due: 14, creator: marcus, members: ["Yuki Tanaka"] },
    { list: "To Do", title: "Wire up new collaboration engine API", priority: "HIGH", due: 3, creator: marcus, members: ["Diego Santos", "Omar Haddad"] },
    { list: "To Do", title: "Design empty states for the dashboard", priority: "MEDIUM", due: 5, creator: priya, members: ["Lena Park"] },
    { list: "To Do", title: "Draft launch announcement copy", priority: "LOW", due: 6, creator: sofia, members: ["Sofia Rossi"] },
    { list: "In Progress", title: "Redesigned dashboard layout", priority: "HIGH", due: 2, creator: marcus, members: ["Yuki Tanaka", "Lena Park"] },
    { list: "In Progress", title: "Migrate auth to new session model", priority: "HIGH", due: 1, creator: marcus, members: ["Omar Haddad"] },
    { list: "Review", title: "Real-time sync edge-case fixes", priority: "MEDIUM", due: 0, creator: marcus, members: ["Diego Santos"] },
    { list: "Done", title: "Set up staging environment", priority: "MEDIUM", due: -4, creator: marcus, members: ["Omar Haddad", "Diego Santos"] },
    { list: "Done", title: "Brand refresh applied to app shell", priority: "LOW", due: -7, creator: sofia, members: ["Lena Park"] },
  ];

  let taskCount = 0;
  let assigneeCount = 0;
  const taskIdByTitle: Record<string, string> = {};
  for (const t of tasks) {
    const positionInList = tasks
      .filter((x) => x.list === t.list)
      .indexOf(t);
    const task = await db.task.create({
      data: {
        title: t.title,
        priority: t.priority,
        position: positionInList * 1000,
        dueDate:
          t.due === null
            ? null
            : t.due >= 0
              ? daysFromNow(t.due)
              : daysAgo(-t.due),
        listId: listIds[t.list],
        creatorId: t.creator,
        createdAt: daysAgo(18 - taskCount),
      },
    });
    taskIdByTitle[t.title] = task.id;
    taskCount++;
    for (const m of t.members) {
      await db.taskAssignee.create({
        data: { taskId: task.id, userId: created[m] },
      });
      assigneeCount++;
    }
  }

  // A few comment threads so cards feel alive.
  const taskComments = [
    { task: "Wire up new collaboration engine API", author: "Diego Santos", body: "Starting on the websocket layer today — will push a draft PR by EOD.", days: 1 },
    { task: "Wire up new collaboration engine API", author: "Marcus Reyes", body: "Great. Let's make sure reconnection backoff is covered.", days: 1 },
    { task: "Redesigned dashboard layout", author: "Lena Park", body: "New layout is in Figma — link in the thread. Feedback welcome 🙏", days: 2 },
    { task: "Redesigned dashboard layout", author: "Yuki Tanaka", body: "Looks clean. I'll start wiring the grid this afternoon.", days: 1 },
    { task: "Real-time sync edge-case fixes", author: "Marcus Reyes", body: "Can you confirm the offline-edit merge case is handled before review?", days: 0 },
  ];
  let commentCount = 0;
  for (const c of taskComments) {
    const tid = taskIdByTitle[c.task];
    if (!tid) continue;
    await db.taskComment.create({
      data: { taskId: tid, authorId: created[c.author], body: c.body, createdAt: daysAgo(c.days) },
    });
    commentCount++;
  }

  // ── Projects (each with its own board + member roster) ────────────────────
  const projectDefs = [
    {
      name: "Mobile App Redesign",
      description:
        "Ground-up redesign of the iOS and Android apps for the 3.0 launch.",
      owner: "Ava Chen",
      members: ["Lena Park", "Yuki Tanaka", "Nadia Volkov", "Marcus Reyes"],
      cards: {
        "To Do": [
          { title: "Audit current navigation patterns", priority: "MEDIUM" },
          { title: "Define new design tokens", priority: "HIGH" },
        ],
        "In Progress": [
          { title: "Prototype the new home screen", priority: "HIGH" },
        ],
        Done: [{ title: "Stakeholder kickoff workshop", priority: "LOW" }],
      },
    },
    {
      name: "Data Platform Migration",
      description:
        "Migrate analytics pipelines to the new warehouse with zero downtime.",
      owner: "Ava Chen",
      members: ["Jamal Wright", "Omar Haddad", "Diego Santos"],
      cards: {
        Backlog: [{ title: "Inventory existing pipelines", priority: "MEDIUM" }],
        "To Do": [
          { title: "Set up the new warehouse cluster", priority: "HIGH" },
        ],
        "In Progress": [
          { title: "Dual-write critical events", priority: "HIGH" },
        ],
      },
    },
  ];

  let projectCount = 0;
  for (const pd of projectDefs) {
    const memberSet = Array.from(new Set([pd.owner, ...pd.members]));
    const project = await db.project.create({
      data: {
        name: pd.name,
        description: pd.description,
        owner: { connect: { id: created[pd.owner] } },
        board: {
          create: {
            name: pd.name,
            lists: {
              create: ["Backlog", "To Do", "In Progress", "Review", "Done"].map(
                (n, i) => ({ name: n, position: i * 1000 }),
              ),
            },
          },
        },
        members: { create: memberSet.map((m) => ({ userId: created[m] })) },
      },
      include: { board: { include: { lists: true } } },
    });

    for (const [listName, cards] of Object.entries(pd.cards)) {
      const list = project.board.lists.find((l) => l.name === listName);
      if (!list) continue;
      let pos = 0;
      for (const c of cards) {
        await db.task.create({
          data: {
            title: c.title,
            priority: c.priority,
            position: pos,
            listId: list.id,
            creatorId: created[pd.owner],
          },
        });
        pos += 1000;
      }
    }
    projectCount++;
  }

  console.log(`✅ Seeded ${people.length} users, ${announcements.length} announcements, ${docs.length} docs, ${leave.length} leave requests, ${taskCount} tasks (${assigneeCount} assignments, ${commentCount} comments), ${projectCount} projects.`);
  console.log("\n🔑 Login with any of:");
  console.log("   ava.chen@2wayclick.com       (Admin / CEO)");
  console.log("   marcus.reyes@2wayclick.com   (Manager / VP Eng)");
  console.log("   diego.santos@2wayclick.com   (Employee)");
  console.log("   Password for all: password123\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
