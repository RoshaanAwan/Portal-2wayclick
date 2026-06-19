import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function timeAgo(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  const intervals: [number, string][] = [
    [31536000, "y"],
    [2592000, "mo"],
    [86400, "d"],
    [3600, "h"],
    [60, "m"],
  ];
  for (const [secs, label] of intervals) {
    const count = Math.floor(seconds / secs);
    if (count >= 1) return `${count}${label} ago`;
  }
  return "just now";
}

// Render a minute count as "2h 30m" / "45m" / "3h". 0 → "0m". A missing or
// non-finite value (e.g. an older card serialized before this field existed)
// reads as "0m" rather than "NaNm".
export function formatMinutes(minutes: number | null | undefined): string {
  const total =
    Number.isFinite(minutes) && minutes != null
      ? Math.max(0, Math.round(minutes))
      : 0;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Parse a free-text duration into whole minutes. Accepts forms like "2h 30m",
// "90m", "1.5h", "2h", or a bare number (read as minutes). Returns null if the
// input doesn't contain a recognisable duration.
export function parseDuration(input: string): number | null {
  const str = input.trim().toLowerCase();
  if (!str) return null;

  // Bare number → minutes (e.g. "90").
  if (/^\d+(\.\d+)?$/.test(str)) {
    return Math.round(parseFloat(str));
  }

  let minutes = 0;
  let matched = false;
  const hours = str.match(/(\d+(?:\.\d+)?)\s*h/);
  if (hours) {
    minutes += parseFloat(hours[1]) * 60;
    matched = true;
  }
  const mins = str.match(/(\d+(?:\.\d+)?)\s*m/);
  if (mins) {
    minutes += parseFloat(mins[1]);
    matched = true;
  }
  if (!matched) return null;
  return Math.round(minutes);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function formatFileSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}
