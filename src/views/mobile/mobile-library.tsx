import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Bookmark, Clock, Link2, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import {
  DEFAULT_SORT,
  defaultDirFor,
  hasRatings,
  readSavedSort,
  sortEntries,
  writeSavedSort,
  type SortKey,
  type SortState,
} from "@/lib/library/sort";
import { Poster, usePosterChain } from "@/components/poster";
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import { isMobileNative } from "@/lib/platform";
import { useT } from "@/lib/i18n";
import { library, libraryMetaType, type LibraryItem } from "@/lib/stremio";
import { readLocalEntries, subscribeWatchlist, type LocalEntry } from "@/lib/watchlist";
import { useMediaFavorites, type MediaEntry } from "@/lib/media-favorites";
import { useLocalCwLibraryItems } from "@/lib/continue-watching";
import { useLocalWatched, type LocalWatchedEntry } from "@/lib/library/local-watched";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import { fetchWatchedHistory, type HistoryItem } from "@/lib/trakt/history";
import { traktItemToMeta } from "@/lib/trakt/to-meta";
import type { TraktItem } from "@/lib/trakt/types";
import { useTrakt } from "@/lib/trakt/provider";
import type { RemoteLibraryItem } from "@/lib/remote/protocol";
import { useMobileRemote } from "./mobile-remote";
import { MobileDetail } from "./mobile-detail";

type SectionId = "watchlist" | "history" | "favorites";
type Entry = { meta: Meta; date: number };
type SectionState = { entries: Entry[]; loading: boolean };

const SECTIONS: Array<{ id: SectionId; label: string; icon: LucideIcon }> = [
  { id: "watchlist", label: "Watchlist", icon: Bookmark },
  { id: "history", label: "History", icon: Clock },
  { id: "favorites", label: "Favorites", icon: Star },
];

const EMPTY: Record<SectionId, { icon: LucideIcon; title: string; body: string }> = {
  watchlist: {
    icon: Bookmark,
    title: "Your watchlist is empty",
    body: "Save a movie or show from any detail page and it lines up here for later.",
  },
  history: {
    icon: Clock,
    title: "Nothing watched yet",
    body: "Press play on something. It shows up here once you start watching.",
  },
  favorites: {
    icon: Star,
    title: "No favorites yet",
    body: "Tap the star on any movie or show to keep it close.",
  },
};

const TAB_KEY = "harbor.mobile.library.tab";

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "title", label: "Title" },
  { key: "rating", label: "Rating" },
];

const VIEW_SWAP_CSS = `
@keyframes ml-view-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.ml-view-in { animation: ml-view-in 260ms var(--ease-out) both; }
@media (prefers-reduced-motion: reduce) {
  .ml-view-in { animation: none; }
}
`;

function readSavedTab(): SectionId {
  try {
    const v = localStorage.getItem(TAB_KEY);
    if (v === "watchlist" || v === "history" || v === "favorites") return v;
  } catch {}
  return "watchlist";
}

export function MobileLibrary({ onConnect }: { onConnect?: () => void }) {
  const [tab, setTab] = useState<SectionId>(readSavedTab);
  const [sort, setSort] = useState<SortState>(readSavedSort);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const { data, connected } = useLibraryData();
  const native = isMobileNative();

  useEffect(() => {
    try {
      localStorage.setItem(TAB_KEY, tab);
    } catch {}
  }, [tab]);

  useEffect(() => {
    writeSavedSort(sort);
  }, [sort]);

  const base = data[tab];
  const showRating = useMemo(() => hasRatings(base.entries), [base.entries]);
  // Fall back to the default key if a stale saved "rating" choice has no
  // ratings to sort by in the current tab.
  const effectiveSort = sort.key === "rating" && !showRating ? DEFAULT_SORT : sort;
  const active = useMemo<SectionState>(
    () => ({ entries: sortEntries(base.entries, effectiveSort), loading: base.loading }),
    [base.entries, base.loading, effectiveSort],
  );

  return (
    <div
      className="flex flex-col gap-6 px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      <style>{VIEW_SWAP_CSS}</style>
      <Header />
      <TabStrip tab={tab} onTab={setTab} />
      <SortBar sort={effectiveSort} onSort={setSort} showRating={showRating} />
      <div key={tab} className="ml-view-in">
        <Section state={active} kind={tab} onOpenDetail={setDetailMeta} />
      </div>
      {/* A linked desktop is additive, not required: everything above is built on
          this device. Offer the link only as a way to merge a desktop library. */}
      {native && !connected && onConnect && active.entries.length > 0 && (
        <ConnectHint onConnect={onConnect} />
      )}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
    </div>
  );
}

function Header() {
  const t = useT();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-ink-subtle">
        {t("My library")}
      </span>
      <h1 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">
        {t("Your collection")}
      </h1>
    </div>
  );
}

function TabStrip({ tab, onTab }: { tab: SectionId; onTab: (t: SectionId) => void }) {
  const t = useT();
  return (
    <div className="flex items-center gap-1.5">
      {SECTIONS.map((s) => {
        const on = s.id === tab;
        const Icon = s.icon;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onTab(s.id)}
            aria-current={on ? "page" : undefined}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2.5 text-[13.5px] font-semibold transition-colors duration-200 active:scale-[0.97] motion-reduce:transition-none ${
              on ? "bg-ink text-canvas" : "bg-surface text-ink-muted ring-1 ring-edge-soft"
            }`}
          >
            <Icon size={15} strokeWidth={2.3} />
            {t(s.label)}
          </button>
        );
      })}
    </div>
  );
}

function SortBar({
  sort,
  onSort,
  showRating,
}: {
  sort: SortState;
  onSort: (s: SortState) => void;
  showRating: boolean;
}) {
  const t = useT();
  const options = showRating ? SORT_OPTIONS : SORT_OPTIONS.filter((o) => o.key !== "rating");
  const asc = sort.dir === "asc";
  const DirIcon = asc ? ArrowUp : ArrowDown;
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div
        role="tablist"
        aria-label={t("Sort by")}
        className="inline-flex gap-1 rounded-full bg-elevated/60 p-1 ring-1 ring-edge-soft/60"
      >
        {options.map((o) => {
          const on = o.key === sort.key;
          return (
            <button
              key={o.key}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onSort(on ? sort : { key: o.key, dir: defaultDirFor(o.key) })}
              className={`h-8 rounded-full px-3.5 text-[12.5px] font-semibold transition-[color,background-color,transform] active:scale-[0.97] motion-reduce:transition-none ${
                on ? "bg-ink text-canvas" : "text-ink-muted"
              }`}
            >
              {t(o.label)}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onSort({ key: sort.key, dir: asc ? "desc" : "asc" })}
        aria-label={asc ? t("Ascending") : t("Descending")}
        className="no-press grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevated/60 text-ink-muted ring-1 ring-edge-soft/60 transition-transform active:scale-[0.94] motion-reduce:transition-none"
      >
        <DirIcon size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function Section({
  state,
  kind,
  onOpenDetail,
}: {
  state: SectionState;
  kind: SectionId;
  onOpenDetail: (m: Meta) => void;
}) {
  if (state.loading && state.entries.length === 0) return <SkeletonGrid />;
  if (state.entries.length === 0) return <Empty kind={kind} />;
  return (
    <div className="grid grid-cols-3 [@media(max-height:500px)]:grid-cols-6 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5 [@media(min-width:1000px)_and_(min-height:600px)]:grid-cols-6 gap-x-3 gap-y-4">
      {state.entries.map((e) => (
        <GridTile key={e.meta.id} meta={e.meta} onOpenDetail={onOpenDetail} />
      ))}
    </div>
  );
}

function GridTile({ meta, onOpenDetail }: { meta: Meta; onOpenDetail: (m: Meta) => void }) {
  const { settings } = useSettings();
  const { src, onError } = usePosterChain(
    settings.rpdbKey,
    meta.id,
    meta.poster,
    meta.type === "series" ? "series" : "movie",
  );
  return (
    <button
      type="button"
      onClick={() => onOpenDetail(meta)}
      className="text-start"
    >
      <Poster src={src} onError={onError} seed={meta.id} ratio="portrait" lazy className="rounded-[12px]" />
      {meta.name && (
        <p className="mt-1.5 line-clamp-2 text-[12px] font-medium leading-snug text-ink-muted">
          {meta.name}
        </p>
      )}
    </button>
  );
}

function SkeletonGrid() {
  return (
    <div className="harbor-skeleton grid grid-cols-3 [@media(max-height:500px)]:grid-cols-6 [@media(min-width:700px)_and_(min-height:600px)]:grid-cols-5 [@media(min-width:1000px)_and_(min-height:600px)]:grid-cols-6 gap-x-3 gap-y-4">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="w-full rounded-[12px] bg-elevated/70" style={{ paddingTop: "150%" }} />
          <div className="h-3 w-3/4 rounded bg-elevated/60" />
        </div>
      ))}
    </div>
  );
}

function Empty({ kind }: { kind: SectionId }) {
  const t = useT();
  const cfg = EMPTY[kind];
  const Icon = cfg.icon;
  // Stacked this runs about 146pt tall, and a landscape phone leaves roughly 127pt
  // between the sort row and the floating bars, so the icon sat behind the tab bar.
  // On a short viewport it lies on its side instead, which halves the height.
  return (
    <div className="flex flex-col items-center gap-4 pt-16 text-center [@media(max-height:500px)]:flex-row [@media(max-height:500px)]:justify-center [@media(max-height:500px)]:pt-6 [@media(max-height:500px)]:text-start">
      <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-elevated/40 text-ink-subtle ring-1 ring-edge-soft [@media(max-height:500px)]:h-12 [@media(max-height:500px)]:w-12">
        <Icon size={26} strokeWidth={1.8} />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="font-display text-[18px] font-medium tracking-[-0.01em] text-ink">
          {t(cfg.title)}
        </h2>
        <p className="max-w-[270px] text-[13.5px] leading-relaxed text-ink-muted">{t(cfg.body)}</p>
      </div>
    </div>
  );
}

function ConnectHint({ onConnect }: { onConnect: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onConnect}
      className="flex items-center justify-center gap-2 rounded-full border border-edge-soft bg-surface/60 px-4 py-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60"
    >
      <Link2 size={14} strokeWidth={2.4} />
      {t("Connect a computer to merge its library")}
    </button>
  );
}

function parseDate(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : 0;
  }
  return 0;
}

function libToEntry(i: LibraryItem, dateField: "mtime" | "watched"): Entry {
  return {
    meta: {
      id: i._id,
      type: libraryMetaType(i.type),
      name: i.name,
      poster: i.poster,
      background: i.background,
    },
    date: dateField === "watched" ? parseDate(i.state?.lastWatched ?? i._mtime) : parseDate(i._mtime),
  };
}

function localToEntry(e: LocalEntry): Entry {
  return {
    meta: { id: e.id, type: e.type, name: e.name || e.id, poster: e.poster },
    date: e.addedAt || 0,
  };
}

function watchedToEntry(e: LocalWatchedEntry): Entry {
  return { meta: { id: e.id, type: e.type, name: e.name, poster: e.poster }, date: e.at || 0 };
}

function favToEntry(e: MediaEntry): Entry {
  return {
    meta: { id: e.id, type: e.type, name: e.name || e.id, poster: e.poster },
    date: e.addedAt || 0,
  };
}

function traktWatchlistToEntry(item: TraktItem): Entry | null {
  const meta = traktItemToMeta(item);
  if (!meta) return null;
  return { meta, date: parseDate(item.contextDate) };
}

function traktHistoryToEntry(h: HistoryItem): Entry | null {
  const id = h.type === "movie" ? h.imdb : h.showImdb;
  if (!id) return null;
  return {
    meta: { id, type: h.type === "movie" ? "movie" : "series", name: h.title },
    date: parseDate(h.watchedAt),
  };
}

function remoteToEntries(items?: RemoteLibraryItem[]): Entry[] {
  return (items ?? []).map((it) => ({
    meta: {
      id: it.id,
      type: it.type as Meta["type"],
      name: it.name ?? "",
      poster: it.poster,
      background: it.background,
    },
    date: 0,
  }));
}

// Watchlist parity with desktop filterLibrary("watchlist"): drop removed and
// anything already started or watched so this stays the saved-for-later list.
function filterWatchlist(items: LibraryItem[], bookmarkedOnly: boolean): LibraryItem[] {
  return items.filter((i) => {
    if (i.removed) return false;
    if (bookmarkedOnly && i.temp) return false;
    if ((i.state?.flaggedWatched ?? 0) > 0 || (i.state?.timesWatched ?? 0) > 0) return false;
    if ((i.state?.timeOffset ?? 0) > 0) return false;
    return true;
  });
}

// History parity with desktop filterHistory: keep anything with a watch signal
// (progress, flagged, or times watched), newest first.
function filterHistory(items: LibraryItem[]): LibraryItem[] {
  return items
    .filter((i) => !i.removed || i.temp)
    .filter(
      (i) =>
        (i.state?.flaggedWatched ?? 0) > 0 ||
        (i.state?.timesWatched ?? 0) > 0 ||
        (i.state?.timeOffset ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        parseDate(b.state?.lastWatched ?? b._mtime) - parseDate(a.state?.lastWatched ?? a._mtime),
    );
}

// First-wins dedup across sources: by id, then by normalized type+name so the
// same title arriving from Stremio, Trakt, local, and a desktop snapshot lands
// once. Sorted newest first with undated entries last.
function dedupEntries(groups: Entry[][]): Entry[] {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .trim();
  const seenId = new Set<string>();
  const seenName = new Set<string>();
  const out: Entry[] = [];
  for (const group of groups) {
    for (const e of group) {
      if (!e.meta.id || seenId.has(e.meta.id)) continue;
      const nameKey = e.meta.name ? `${e.meta.type}:${norm(e.meta.name)}` : "";
      if (nameKey && seenName.has(nameKey)) continue;
      seenId.add(e.meta.id);
      if (nameKey) seenName.add(nameKey);
      out.push(e);
    }
  }
  return out.sort((a, b) => b.date - a.date);
}

// Builds all three library sections on-device, 1:1 with the desktop tabs:
//   watchlist = local saved + Stremio cloud library + Trakt + desktop snapshot
//   history   = Stremio cloud + local continue-watching + on-device watched
//               marks + Trakt + desktop snapshot
//   favorites = local media favorites + snapshot
// A connected desktop is merged in additively; it is never required.
function useLibraryData(): { data: Record<SectionId, SectionState>; connected: boolean } {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const { snapshot, connected } = useMobileRemote();
  const remoteLib = snapshot.library;
  const { items: favItems } = useMediaFavorites();
  const localCw = useLocalCwLibraryItems();
  const localWatched = useLocalWatched();

  const [localWatch, setLocalWatch] = useState<LocalEntry[]>(() => readLocalEntries());
  useEffect(() => {
    const tick = () => setLocalWatch(readLocalEntries());
    window.addEventListener("storage", tick);
    const unsub = subscribeWatchlist(tick);
    return () => {
      window.removeEventListener("storage", tick);
      unsub();
    };
  }, []);

  const [stremio, setStremio] = useState<LibraryItem[]>([]);
  const [stremioLoaded, setStremioLoaded] = useState(false);
  useEffect(() => {
    if (!authKey) {
      setStremio([]);
      setStremioLoaded(true);
      return;
    }
    let cancelled = false;
    setStremioLoaded(false);
    library(authKey)
      .then((items) => {
        if (!cancelled) setStremio(items);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStremioLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [authKey]);

  const [traktWl, setTraktWl] = useState<TraktItem[]>([]);
  const [traktHist, setTraktHist] = useState<HistoryItem[]>([]);
  const [traktLoaded, setTraktLoaded] = useState(false);
  useEffect(() => {
    if (!traktConnected) {
      setTraktWl([]);
      setTraktHist([]);
      setTraktLoaded(true);
      return;
    }
    let cancelled = false;
    setTraktLoaded(false);
    Promise.allSettled([fetchWatchlist(), fetchWatchedHistory(200)])
      .then(([wl, hist]) => {
        if (cancelled) return;
        if (wl.status === "fulfilled") setTraktWl(wl.value);
        if (hist.status === "fulfilled") setTraktHist(hist.value);
      })
      .finally(() => {
        if (!cancelled) setTraktLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [traktConnected]);

  return useMemo(() => {
    const stremioPending = !!authKey && !stremioLoaded;
    const traktPending = traktConnected && !traktLoaded;
    const remotePending = connected && !remoteLib;
    const baseLoading = stremioPending || traktPending || remotePending;

    const watchlist = dedupEntries([
      filterWatchlist(stremio, !!settings.libraryBookmarkedOnly).map((i) => libToEntry(i, "mtime")),
      localWatch.map(localToEntry),
      traktWl.map(traktWatchlistToEntry).filter((e): e is Entry => e !== null),
      remoteToEntries(remoteLib?.watchlist),
    ]);

    const history = dedupEntries([
      filterHistory(stremio).map((i) => libToEntry(i, "watched")),
      localCw.map((i) => libToEntry(i, "watched")),
      localWatched.map(watchedToEntry),
      traktHist.map(traktHistoryToEntry).filter((e): e is Entry => e !== null),
      remoteToEntries(remoteLib?.history),
    ]);

    const favorites = dedupEntries([
      [...favItems.values()].map(favToEntry),
      remoteToEntries(remoteLib?.favorites),
    ]);

    return {
      connected,
      data: {
        watchlist: { entries: watchlist, loading: baseLoading },
        history: { entries: history, loading: baseLoading },
        favorites: { entries: favorites, loading: remotePending },
      },
    };
  }, [
    authKey,
    stremio,
    stremioLoaded,
    traktConnected,
    traktLoaded,
    traktWl,
    traktHist,
    connected,
    remoteLib,
    favItems,
    localCw,
    localWatch,
    localWatched,
    settings.libraryBookmarkedOnly,
  ]);
}
