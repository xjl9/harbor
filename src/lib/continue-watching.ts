import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings";
import { isCorruptAnimeEntry } from "@/lib/anime-cw-repair";
import { dismissCw, isCwDismissed } from "@/lib/cw-dismiss";
import { clearLocalCw, listLocalCw, localCwVersion, subscribeLocalCw } from "@/lib/local-cw";
import { dismissManualWatched, manualWatchedLibraryItems } from "@/lib/manual-watched";
import { franchiseRoot, franchiseRootSync } from "@/lib/providers/anime-franchise-root";
import {
  ANIME_CLOUD_ID,
  cwSortKey,
  episodeFromVideoId,
  isAnimeCwItem,
  isCwMember,
  library,
  type LibraryItem,
} from "@/lib/stremio";

export type CwCard = {
  id: string;
  type: "movie" | "series";
  name: string;
  poster?: string;
  background?: string;
  season?: number;
  episode?: number;
  videoId?: string;
  progress: number;
  at: number;
};

export function localToLibraryItem(e: ReturnType<typeof listLocalCw>[number]): LibraryItem {
  return {
    _id: e.id,
    type: e.type,
    name: e.name,
    poster: e.poster,
    background: e.background,
    state: {
      timeOffset: e.positionMs,
      duration: e.durationMs,
      season: e.season,
      episode: e.episode,
      video_id:
        e.videoId ??
        (e.season != null && e.episode != null ? `${e.id}:${e.season}:${e.episode}` : undefined),
      flaggedWatched: e.durationMs > 0 && e.positionMs / e.durationMs >= 0.9 ? 1 : 0,
      lastWatched: new Date(e.t).toISOString(),
    },
    removed: false,
    temp: false,
    _ctime: new Date(e.t).toISOString(),
    _mtime: new Date(e.t).toISOString(),
    local: true,
  };
}

export function useLocalCwLibraryItems(): LibraryItem[] {
  const ver = useSyncExternalStore(subscribeLocalCw, localCwVersion);
  return useMemo(() => {
    void ver;
    return listLocalCw().map(localToLibraryItem);
  }, [ver]);
}

// Cloud library slice for CW rows: one fetch per auth change plus the same
// 30s poll / focus / visibilitychange refresh cadence desktop home uses.
// Desktop home keeps its richer loader (discover tracking, name repair,
// resume sync); mobile consumes this directly.
export function useCwCloudLibrary(authKey: string | null, active = true): LibraryItem[] {
  const [items, setItems] = useState<LibraryItem[]>([]);
  useEffect(() => {
    if (!authKey) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const load = () => {
      library(authKey)
        .then((libItems) => {
          if (cancelled) return;
          const view = libItems.some(isCorruptAnimeEntry)
            ? libItems.filter((i) => !isCorruptAnimeEntry(i))
            : libItems;
          setItems(view);
        })
        .catch(() => {});
    };
    load();
    if (!active) {
      return () => {
        cancelled = true;
      };
    }
    let debounce: number | null = null;
    const refresh = () => {
      if (document.visibilityState !== "visible" || debounce != null) return;
      debounce = window.setTimeout(() => {
        debounce = null;
        load();
      }, 600);
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const poll = window.setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      if (debounce != null) window.clearTimeout(debounce);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(poll);
    };
  }, [authKey, active]);
  return items;
}

// The Continue Watching merge shared by desktop home and mobile: eligibility
// filter, sort, id dedup, per-name newest-wins dedup (cap 100), then
// franchise-root dedup. Reads module-level dismiss/franchise/anime-detect
// state, so callers must invalidate on their version counters.
export function mergeContinueWatching(
  cloudItems: LibraryItem[],
  simklCw: LibraryItem[],
  localCwItems: LibraryItem[],
  opts: { cwPerProfile: boolean; hideAnime: boolean },
): LibraryItem[] {
  const cwBase = opts.cwPerProfile
    ? []
    : [...cloudItems.filter((i) => !ANIME_CLOUD_ID.test(i._id)), ...simklCw];
  const eligible = [...cwBase, ...localCwItems]
    .filter(
      (i) =>
        (i.type as string) !== "other" &&
        !i._id.startsWith("iptv:") &&
        !isCwDismissed(i) &&
        isCwMember(i) &&
        !(opts.hideAnime && isAnimeCwItem(i)),
    )
    .map((i) => ({ i, k: cwSortKey(i) }))
    .sort((a, b) => b.k - a.k)
    .map((e) => e.i);
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
  const lastWatchedOf = (i: LibraryItem) => {
    const lw = Date.parse(i.state?.lastWatched ?? "");
    if (Number.isFinite(lw) && lw > 0) return lw;
    const m = i._mtime as unknown;
    const mt = typeof m === "number" ? m : Date.parse(String(m ?? ""));
    return Number.isFinite(mt) ? mt : 0;
  };
  const byId = new Map<string, LibraryItem>();
  const byName = new Map<string, LibraryItem>();
  for (const i of eligible) {
    if (byId.has(i._id)) continue;
    const nm = norm(i.name ?? "");
    const key = `${i.type}:${nm}`;
    if (nm) {
      const held = byName.get(key);
      if (held) {
        if (lastWatchedOf(i) > lastWatchedOf(held)) {
          byId.delete(held._id);
          byName.set(key, i);
          byId.set(i._id, i);
        }
        continue;
      }
      byName.set(key, i);
    }
    byId.set(i._id, i);
    if (byId.size >= 100) break;
  }
  const seenRoot = new Set<string>();
  for (const i of [...byId.values()].sort((a, b) => lastWatchedOf(b) - lastWatchedOf(a))) {
    const root = franchiseRootSync(i._id);
    if (root && seenRoot.has(root)) byId.delete(i._id);
    if (root) seenRoot.add(root);
  }
  return [...byId.values()].sort((a, b) => cwSortKey(b) - cwSortKey(a));
}

// Prefetches franchise roots for the given CW members so franchiseRootSync
// resolves inside mergeContinueWatching; returns a counter that bumps once
// the roots land.
export function useCwFranchiseRootsVersion(items: LibraryItem[]): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const ids = items.filter((i) => isCwMember(i)).map((i) => i._id);
    if (ids.length === 0) return;
    if (ids.every((id) => franchiseRootSync(id))) return;
    const load = async () => {
      await Promise.allSettled(ids.map((id) => franchiseRoot(id)));
      if (!cancelled) setVersion((v) => v + 1);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [items]);
  return version;
}

// Resurface pool for useCwAdvance: cloud + local series, with manual-watched
// entries overriding non-CW-member duplicates.
export function buildCwResurfaceLibrary(
  cloudItems: LibraryItem[],
  localCwItems: LibraryItem[],
): LibraryItem[] {
  const pool = [
    ...cloudItems.filter((i) => !ANIME_CLOUD_ID.test(i._id)),
    ...localCwItems.filter((i) => i.type === "series"),
  ];
  const manual = manualWatchedLibraryItems();
  if (manual.length === 0) return pool;
  const cwMemberIds = new Set(pool.filter(isCwMember).map((i) => i._id));
  const usable = manual.filter((i) => !cwMemberIds.has(i._id));
  if (usable.length === 0) return pool;
  const overrideIds = new Set(usable.map((i) => i._id));
  return [...pool.filter((i) => !overrideIds.has(i._id)), ...usable];
}

// Three-way dismiss: manual-watched entries clear their override, local
// entries must ALSO clear localcw storage or they resurface on the next
// merge, and cloud entries go through the dismiss ledger alone.
export function dismissCwItem(item: LibraryItem, authKey: string | null): void {
  if (item.manualWatched) {
    dismissManualWatched(item._id);
    return;
  }
  if (item.local) {
    clearLocalCw(item._id);
    dismissCw(item, authKey);
    return;
  }
  dismissCw(item, authKey);
}

function episodeOf(i: LibraryItem): { season: number; episode: number } | null {
  const season = i.state?.season;
  const episode = i.state?.episode;
  if (season && episode) return { season, episode };
  const vid = i.state?.video_id ?? "";
  if (/^(kitsu|mal|anilist|anidb):/.test(i._id) && vid.split(":").length === 3) {
    const ep = Number(vid.split(":")[2]);
    return Number.isFinite(ep) && ep > 0 ? { season: 1, episode: ep } : null;
  }
  const parsed = episodeFromVideoId(vid);
  return parsed && parsed.episode > 0 ? parsed : null;
}

function watchedAt(i: LibraryItem): number {
  const lw = i.state?.lastWatched ? Date.parse(i.state.lastWatched) : NaN;
  if (Number.isFinite(lw)) return lw;
  const m = i._mtime ? Date.parse(i._mtime) : NaN;
  return Number.isFinite(m) ? m : 0;
}

function toCard(i: LibraryItem): CwCard {
  const ep = i.type === "movie" ? null : episodeOf(i);
  const duration = i.state?.duration ?? 0;
  const offset = i.state?.timeOffset ?? 0;
  return {
    id: i._id,
    type: i.type === "movie" ? "movie" : "series",
    name: i.name,
    poster: i.poster,
    background: i.background,
    season: ep?.season,
    episode: ep?.episode,
    videoId: i.state?.video_id,
    progress: duration > 0 ? Math.min(1, offset / duration) : 0,
    at: watchedAt(i),
  };
}

export function useContinueWatching(excludeId?: string, limit = 12): CwCard[] {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const cwPerProfile = settings.cwPerProfile;
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [localVersion, setLocalVersion] = useState(0);

  useEffect(() => {
    if (!authKey) {
      setItems([]);
      return;
    }
    let cancelled = false;
    library(authKey)
      .then((li) => {
        if (!cancelled) setItems(li);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  useEffect(() => subscribeLocalCw(() => setLocalVersion((v) => v + 1)), []);

  return useMemo(() => {
    void localVersion;
    const base = cwPerProfile ? [] : items.filter((i) => !ANIME_CLOUD_ID.test(i._id));
    const merged = [...base, ...listLocalCw().map(localToLibraryItem)]
      .filter((i) => (i.type as string) !== "other" && !i._id.startsWith("iptv:") && isCwMember(i))
      .map((i) => ({ i, k: cwSortKey(i) }))
      .sort((a, b) => b.k - a.k)
      .map((e) => e.i);
    const seen = new Set<string>();
    const out: CwCard[] = [];
    for (const i of merged) {
      if (i._id === excludeId || seen.has(i._id)) continue;
      seen.add(i._id);
      out.push(toCard(i));
      if (out.length >= limit) break;
    }
    return out;
  }, [items, localVersion, excludeId, limit, cwPerProfile]);
}
