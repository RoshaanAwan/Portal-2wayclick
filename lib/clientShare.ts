import "server-only";
import { db } from "./db";
import type {
  ClientBoardDTO,
  ClientCardDTO,
  ClientListDTO,
} from "./clientShareTypes";

export type {
  ClientBoardDTO,
  ClientCardDTO,
  ClientListDTO,
  ClientCommentDTO,
} from "./clientShareTypes";

// ── Public client-share data layer ─────────────────────────────────────────
// Everything the login-less /shared/<token> board needs. The token is the only
// gate, so these functions resolve strictly by shareToken (never by project id
// from the URL) and expose ONLY what a client should see — no member roster, no
// internal creator/assignee identities, no audit trail.

// Client comments are stored as ordinary TaskComments (so the team sees them on
// the internal board) but their body is wrapped with this marker so both the
// public board and the team board can recognise + attribute them without a
// brittle join. Format: "[client:Jane @ Acme] the actual message".
const CLIENT_PREFIX = "[client:";

/** Wrap a client message with its attribution marker for storage. */
export function encodeClientComment(clientName: string, body: string): string {
  // Strip any "]" from the name so the marker stays unambiguous.
  return `${CLIENT_PREFIX}${clientName.replace(/\]/g, "")}] ${body}`;
}

/** Pull the client name + clean body back out of a stored comment, or null if
 *  it isn't a client comment. */
export function decodeClientComment(
  stored: string,
): { clientName: string; body: string } | null {
  if (!stored.startsWith(CLIENT_PREFIX)) return null;
  const close = stored.indexOf("]");
  if (close === -1) return null;
  return {
    clientName: stored.slice(CLIENT_PREFIX.length, close),
    body: stored.slice(close + 1).trimStart(),
  };
}

/**
 * Build the client-facing board for a token. Returns null if the token is
 * unknown/revoked. Comments authored by clients carry an attribution marker
 * (see decodeClientComment) so the public UI can label them; everyone else is
 * shown generically as "Team" — we never leak internal names.
 */
export async function getClientBoard(
  token: string,
): Promise<ClientBoardDTO | null> {
  const project = await db.project.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      name: true,
      description: true,
      board: {
        select: {
          lists: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              tasks: {
                orderBy: { position: "asc" },
                select: {
                  id: true,
                  title: true,
                  description: true,
                  priority: true,
                  comments: {
                    orderBy: { createdAt: "asc" },
                    select: { id: true, body: true, createdAt: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!project) return null;

  const lists: ClientListDTO[] = project.board.lists.map((list) => ({
    id: list.id,
    name: list.name,
    cards: list.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      priority: t.priority,
      comments: t.comments.map((c) => {
        // Client-authored comments carry an attribution marker; everyone else
        // is shown generically as "Team" — we never leak internal names.
        const client = decodeClientComment(c.body);
        return {
          id: c.id,
          body: client ? client.body : c.body,
          authorName: client ? client.clientName : "Team",
          isClient: Boolean(client),
          createdAt: c.createdAt.toISOString(),
        };
      }),
    })),
  }));

  // Requests drop into "Backlog" if it exists, else the leftmost list.
  const backlog =
    project.board.lists.find((l) => l.name.toLowerCase() === "backlog") ??
    project.board.lists[0] ??
    null;

  return {
    projectId: project.id,
    name: project.name,
    description: project.description,
    lists,
    backlogListId: backlog?.id ?? null,
  };
}
