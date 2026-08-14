import type { Meta } from "@/lib/cinemeta";

// Sorting for the mobile library grid. Operates on the normalized Entry shape
// (a Meta plus a single epoch-ms `date`, 0 when unknown) that every library
// source is collapsed to before rendering. Kept out of the view so the
// comparators stay testable and the component stays small.

export type SortableEntry = { meta: Meta; date: number };

export type SortKey = "recent" | "title" | "rating";
export type SortDir = "asc" | "desc";
export type SortState = { key: SortKey; dir: SortDir };

export const SORT_STORAGE_KEY = "harbor.mobile.library.sort";

// The direction a key reads as "natural" so switching keys lands on the
// expected order (newest-first, A-Z, highest-rated-first).
export function defaultDirFor(key: SortKey): SortDir {
  return key === "title" ? "asc" : "desc";
}

export const DEFAULT_SORT: SortState = { key: "recent", dir: "desc" };

// Strip a single leading article so "The Matrix" files under M, not T. This is
// the Nuvio bug we deliberately beat. Case-insensitive; leaves the rest intact
// for a locale-aware compare.
const ARTICLE_RE = /^(the|a|an)\s+/i;

export function sortTitle(name: string | undefined): string {
  if (!name) return "";
  return name.trim().replace(ARTICLE_RE, "").trim();
}

// A numeric rating for an entry, or null when none is populated. Library
// adapters do not set these today, so `hasRatings` gates the UI option; the
// logic is here for the day a source carries a rating. imdbRating (a string
// like "7.5") wins over tmdbScore.
export function entryRating(e: SortableEntry): number | null {
  const imdb = e.meta.imdbRating;
  if (imdb != null && imdb !== "") {
    const n = Number.parseFloat(imdb);
    if (Number.isFinite(n)) return n;
  }
  const tmdb = e.meta.tmdbScore;
  if (typeof tmdb === "number" && Number.isFinite(tmdb)) return tmdb;
  return null;
}

export function hasRatings(entries: SortableEntry[]): boolean {
  return entries.some((e) => entryRating(e) != null);
}

// Undated entries (date 0, e.g. desktop-snapshot items) sink to the bottom in
// both directions instead of floating to the top on an ascending sort.
function cmpRecent(a: SortableEntry, b: SortableEntry, dir: SortDir): number {
  if (a.date === 0 && b.date === 0) return 0;
  if (a.date === 0) return 1;
  if (b.date === 0) return -1;
  return dir === "asc" ? a.date - b.date : b.date - a.date;
}

function cmpTitle(a: SortableEntry, b: SortableEntry, dir: SortDir): number {
  const an = sortTitle(a.meta.name);
  const bn = sortTitle(b.meta.name);
  if (an === "" && bn === "") return 0;
  if (an === "") return 1;
  if (bn === "") return -1;
  const c = an.localeCompare(bn, undefined, { sensitivity: "base", numeric: true });
  return dir === "asc" ? c : -c;
}

// Unrated entries sink to the bottom in both directions, mirroring undated.
function cmpRating(a: SortableEntry, b: SortableEntry, dir: SortDir): number {
  const ar = entryRating(a);
  const br = entryRating(b);
  if (ar == null && br == null) return 0;
  if (ar == null) return 1;
  if (br == null) return -1;
  return dir === "desc" ? br - ar : ar - br;
}

export function sortEntries<T extends SortableEntry>(entries: T[], sort: SortState): T[] {
  const cmp = sort.key === "title" ? cmpTitle : sort.key === "rating" ? cmpRating : cmpRecent;
  // Array.sort is stable, so ties preserve the incoming dedup order.
  return entries.slice().sort((a, b) => cmp(a, b, sort.dir));
}

function isSortKey(v: unknown): v is SortKey {
  return v === "recent" || v === "title" || v === "rating";
}

function isSortDir(v: unknown): v is SortDir {
  return v === "asc" || v === "desc";
}

export function readSavedSort(): SortState {
  try {
    const raw = localStorage.getItem(SORT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === "object") {
        const { key, dir } = parsed as { key?: unknown; dir?: unknown };
        if (isSortKey(key) && isSortDir(dir)) return { key, dir };
      }
    }
  } catch {}
  return DEFAULT_SORT;
}

export function writeSavedSort(sort: SortState): void {
  try {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(sort));
  } catch {}
}
