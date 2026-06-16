// Plain (non-server-only) DTO types for the public client-share board, so both
// the server data layer (lib/clientShare.ts) and the client UI
// (app/shared/[token]/SharedBoardClient.tsx) can import them without dragging
// the "server-only" guard into the browser bundle.

export interface ClientCommentDTO {
  id: string;
  body: string;
  authorName: string;
  /** True if a client (not the team) authored it — drives the public label. */
  isClient: boolean;
  createdAt: string;
}

export interface ClientCardDTO {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  comments: ClientCommentDTO[];
}

export interface ClientListDTO {
  id: string;
  name: string;
  cards: ClientCardDTO[];
}

export interface ClientBoardDTO {
  projectId: string;
  name: string;
  description: string | null;
  lists: ClientListDTO[];
  /** The list new client requests drop into (Backlog, or the first list). */
  backlogListId: string | null;
}
