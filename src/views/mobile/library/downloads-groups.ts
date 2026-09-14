import type { DownloadItem } from "@/lib/download/downloads-store";
import { toNativeFileUrl } from "@/lib/player/local-url";

// Grouping and filter rules copied from src/views/downloads.tsx, which keeps
// them module-private. Kept byte-for-byte in behaviour so the phone page sorts
// and buckets exactly like the desktop one.

export type DownloadFilter = "all" | "active" | "saved" | "issues";

export type DownloadGroup =
  | { kind: "movie"; item: DownloadItem }
  | { kind: "show"; metaId: string; title: string; poster: string | null; items: DownloadItem[] };

export function statusRank(s: DownloadItem["status"]): number {
  return s === "downloading" || s === "paused" ? 0 : s === "error" ? 1 : s === "done" ? 2 : 3;
}

export function matchesFilter(d: DownloadItem, f: DownloadFilter): boolean {
  if (f === "active") return d.status === "downloading" || d.status === "paused";
  if (f === "saved") return d.status === "done";
  if (f === "issues") return d.status === "error" || d.status === "interrupted";
  return true;
}

export function countFilters(items: DownloadItem[]): Record<DownloadFilter, number> {
  return {
    all: items.length,
    active: items.filter((d) => matchesFilter(d, "active")).length,
    saved: items.filter((d) => matchesFilter(d, "saved")).length,
    issues: items.filter((d) => matchesFilter(d, "issues")).length,
  };
}

export function buildGroups(items: DownloadItem[]): DownloadGroup[] {
  const shows = new Map<string, DownloadItem[]>();
  const movies: DownloadItem[] = [];
  for (const d of items) {
    if (d.season != null) {
      const arr = shows.get(d.metaId);
      if (arr) arr.push(d);
      else shows.set(d.metaId, [d]);
    } else {
      movies.push(d);
    }
  }
  const groups: DownloadGroup[] = movies.map((item) => ({ kind: "movie", item }));
  for (const [metaId, arr] of shows) {
    groups.push({ kind: "show", metaId, title: arr[0].title, poster: arr[0].poster, items: arr });
  }
  const keyOf = (g: DownloadGroup) => {
    const its = g.kind === "movie" ? [g.item] : g.items;
    return {
      best: Math.min(...its.map((d) => statusRank(d.status))),
      recent: Math.max(...its.map((d) => d.startedAt)),
    };
  };
  return groups.sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    return ka.best - kb.best || kb.recent - ka.recent;
  });
}

export type DownloadGlyph = "idle" | "downloading" | "complete" | "error";

// The bespoke download glyphs under public/player-icons carry one file per
// state; paused shares the downloading art because the row already says
// "Paused" in words next to it.
export function downloadGlyph(status: DownloadItem["status"]): DownloadGlyph {
  if (status === "downloading" || status === "paused") return "downloading";
  if (status === "done") return "complete";
  if (status === "error" || status === "interrupted" || status === "canceled") return "error";
  return "idle";
}

export function downloadGlyphSrc(glyph: DownloadGlyph): string {
  return `/player-icons/download--${glyph}.svg`;
}

// The download store records a bare filesystem path. mpv accepts that as-is,
// but AVFoundation's URL(string:) needs a scheme, so an absolute POSIX path is
// turned into a percent-encoded file URL by the shared player helper. Windows
// drive paths and anything already carrying a scheme pass through untouched,
// so the native bridge applying the same helper again is harmless.
export function localFileUrl(path: string): string {
  if (!path) return path;
  return toNativeFileUrl(path);
}
