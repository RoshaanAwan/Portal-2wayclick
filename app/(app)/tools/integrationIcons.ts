import {
  MessageSquare,
  Github,
  Trello,
  Figma,
  NotebookPen,
  BookText,
  HardDrive,
  BarChart3,
  Receipt,
  Siren,
  Plug,
  type LucideIcon,
} from "lucide-react";

// Maps a catalog icon NAME (lib/integrations.ts) → its Lucide component. Kept
// out of the catalog so that module stays plain/server-safe. `Plug` is the
// fallback for any provider whose icon name isn't listed here.
export const INTEGRATION_ICONS: Record<string, LucideIcon> = {
  MessageSquare,
  Github,
  Trello,
  Figma,
  NotebookPen,
  BookText,
  HardDrive,
  BarChart3,
  Receipt,
  Siren,
};

export function integrationIcon(name: string): LucideIcon {
  return INTEGRATION_ICONS[name] ?? Plug;
}
