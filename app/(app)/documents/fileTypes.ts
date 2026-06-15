import {
  FileText,
  FileType2,
  Sheet,
  Presentation,
  Image as ImageIcon,
  type LucideIcon,
} from "lucide-react";

export const FILE_TYPES = ["pdf", "doc", "sheet", "slide", "img"] as const;
export type FileTypeKey = (typeof FILE_TYPES)[number];

interface FileTypeMeta {
  label: string;
  icon: LucideIcon;
  /** Flat tinted tile + border classes, tuned for the light editorial surfaces. */
  tile: string;
  icon_color: string;
  badge: "red" | "cyan" | "emerald" | "amber" | "pink" | "accent";
}

export const FILE_TYPE_META: Record<FileTypeKey, FileTypeMeta> = {
  pdf: {
    label: "PDF",
    icon: FileText,
    tile: "bg-danger-soft border-danger/15",
    icon_color: "text-danger",
    badge: "red",
  },
  doc: {
    label: "Doc",
    icon: FileType2,
    tile: "bg-info-soft border-info/15",
    icon_color: "text-info",
    badge: "cyan",
  },
  sheet: {
    label: "Sheet",
    icon: Sheet,
    tile: "bg-success-soft border-success/15",
    icon_color: "text-success",
    badge: "emerald",
  },
  slide: {
    label: "Slides",
    icon: Presentation,
    tile: "bg-warn-soft border-warn/20",
    icon_color: "text-warn",
    badge: "amber",
  },
  img: {
    label: "Image",
    icon: ImageIcon,
    tile: "bg-accent-soft border-accent/15",
    icon_color: "text-accent",
    badge: "accent",
  },
};

export function fileTypeMeta(fileType: string): FileTypeMeta {
  return FILE_TYPE_META[(fileType as FileTypeKey)] ?? FILE_TYPE_META.pdf;
}
