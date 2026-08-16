import { useSyncExternalStore } from "react";
import { isMovieWatchedLocal, subscribeMovieWatched } from "./movie-watched";
import { persistCritical } from "./storage-recovery";

const KEY = "harbor.watchedFlag.v1";

const subs = new Set<() => void>();
let version = 0;
let cache: Set<string> | null = null;

function load(): Set<string> {
  if (cache) return cache;
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    cache = new Set(Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : []);
  } catch {
    cache = new Set();
  }
  return cache;
}

function persist(next: Set<string>): void {
  cache = next;
  version += 1;
  persistCritical(KEY, JSON.stringify([...next]));
  for (const fn of subs) fn();
}

export function isWatchedFlagged(metaId: string): boolean {
  return load().has(metaId);
}

export function watchedFlagIds(): Set<string> {
  return load();
}

export function setWatchedFlag(metaId: string, watched: boolean): void {
  const cur = load();
  if (cur.has(metaId) === watched) return;
  const next = new Set(cur);
  if (watched) next.add(metaId);
  else next.delete(metaId);
  persist(next);
}

// Covers both stores a "watched" mark writes: the flag set and the movie list.
export function subscribeWatched(fn: () => void): () => void {
  subs.add(fn);
  const offMovie = subscribeMovieWatched(fn);
  return () => {
    subs.delete(fn);
    offMovie();
  };
}

export function useMetaWatched(
  metaId: string | undefined,
  type: string | undefined,
  altId?: string | null,
): boolean {
  return useSyncExternalStore(
    subscribeWatched,
    () => {
      if (!metaId) return false;
      if (load().has(metaId)) return true;
      if (altId && load().has(altId)) return true;
      if (type === "movie") {
        if (isMovieWatchedLocal(metaId)) return true;
        if (altId && isMovieWatchedLocal(altId)) return true;
      }
      return false;
    },
    () => false,
  );
}
