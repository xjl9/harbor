import { useEffect, useState } from "react";
import { isMovieWatchedLocal } from "@/lib/movie-watched";
import { isWatchedFlagged, subscribeWatched } from "@/lib/watched-flag";
import { listWatchEvents, subscribeWatchEvents } from "@/lib/watch-events";

export type LocalWatchedEntry = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  at: number;
};

// Titles marked watched on this device. The watch-event log carries the name and
// poster; the watched flag decides whether the entry still counts, so unmarking
// a title drops it from history instead of leaving a ghost behind.
export function readLocalWatched(): LocalWatchedEntry[] {
  const out = new Map<string, LocalWatchedEntry>();
  for (const e of listWatchEvents()) {
    if (!e.id || !e.name) continue;
    const watched = isWatchedFlagged(e.id) || (e.type === "movie" && isMovieWatchedLocal(e.id));
    if (!watched) continue;
    const prev = out.get(e.id);
    if (prev && prev.at >= e.at) continue;
    out.set(e.id, { id: e.id, type: e.type, name: e.name, poster: e.poster, at: e.at });
  }
  return [...out.values()];
}

export function useLocalWatched(): LocalWatchedEntry[] {
  const [items, setItems] = useState<LocalWatchedEntry[]>(readLocalWatched);
  useEffect(() => {
    const tick = () => setItems(readLocalWatched());
    tick();
    const offEvents = subscribeWatchEvents(tick);
    const offFlags = subscribeWatched(tick);
    return () => {
      offEvents();
      offFlags();
    };
  }, []);
  return items;
}
