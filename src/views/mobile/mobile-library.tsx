import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
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
import { useSettings } from "@/lib/settings";
import { useAuth } from "@/lib/auth";
import { isMobileNative } from "@/lib/platform";
import { useT } from "@/lib/i18n";
import { library, libraryMetaType, type LibraryItem } from "@/lib/stremio";
import { readLocalEntries, subscribeWatchlist, type LocalEntry } from "@/lib/watchlist";
import { useLocalCwLibraryItems } from "@/lib/continue-watching";
import { useLocalWatched, type LocalWatchedEntry } from "@/lib/library/local-watched";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import { fetchWatchedHistory, type HistoryItem } from "@/lib/trakt/history";
import { traktItemToMeta } from "@/lib/trakt/to-meta";
import type { TraktItem } from "@/lib/trakt/types";
import { useTrakt } from "@/lib/trakt/provider";
import { useAnilist } from "@/lib/anilist/provider";
import { useMal } from "@/lib/mal/provider";
import { useSimkl } from "@/lib/simkl/provider";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import type { RemoteLibraryItem } from "@/lib/remote/protocol";
import traktLogo from "@/assets/trakt.svg";
import anilistLogo from "@/assets/anilist.png";
import simklLogo from "@/assets/simkl.png";
import letterboxdLogo from "@/assets/addon-logos/letterboxd.png";
import { MalLogo } from "@/components/icons/mal-logo";
import { UiIcon } from "@/components/ui-icon";
import { SetIcon } from "@/views/settings/set-icon";
import {
  LibraryFeaturedProvider,
  useLibraryFeatured,
  useReportFeatured,
} from "@/views/library/featured-context";
import { pickFeatured } from "@/views/library/featured-picks";
import { filterLibrary } from "@/views/library/watchlist-tab";
import { useMobileRemote } from "./mobile-remote";
import { MobileDetail } from "./mobile-detail";
import { MobileAnilistTab, MobileMalTab } from "./library/anime-tabs";
import { FeaturedRail } from "./library/featured-rail";
import { MobileFavoritesTab } from "./library/favorites-tab";
import { EmptyState, GridTile, PhoneGrid, SkeletonGrid } from "./library/grid";
import { MobileMyListsTab } from "./library/my-lists-tab";
import { readSavedTab, writeSavedTab, type LibraryTab } from "./library/tabs";
import { MobileLetterboxdTab, MobileSimklTab, MobileTraktTab } from "./library/tracker-tabs";
import { MobileWrappedPage } from "./library/wrapped-page";

// The My Stuff tab, 1:1 with src/views/library.tsx: Library and Watchlist
// modes, History, Local, Media Servers, My Lists, Favorites, and a tab per
// connected tracker, with the featured banner and the Stats entry in the header.

type GridKind = "library" | "watchlist" | "history" | "local" | "mediaServers";
type Entry = { meta: Meta; date: number };
type SectionState = { entries: Entry[]; loading: boolean };

const EMPTY: Record<GridKind, { icon: string; title: string; body: string }> = {
  library: {
    icon: "Library",
    title: "Your library is empty",
    body: "Everything you save from Stremio, Trakt, and this device collects here.",
  },
  watchlist: {
    icon: "Bookmark",
    title: "Your watchlist is empty",
    body: "Save a movie or show from any detail page and it lines up here for later.",
  },
  history: {
    icon: "Clock",
    title: "Nothing watched yet",
    body: "Press play on something. It shows up here once you start watching.",
  },
  local: {
    icon: "HardDrive",
    title: "Your local library is empty",
    body: "Scan local folders in Harbor and your movies and shows will appear here.",
  },
  mediaServers: {
    icon: "Server",
    title: "No media-server titles",
    body: "Enable and sync Plex, Jellyfin, or Emby in Harbor to browse them here.",
  },
};

const SORT_OPTIONS: Array<{ key: SortKey; label: string }> = [
  { key: "recent", label: "Recent" },
  { key: "title", label: "Title" },
  { key: "rating", label: "Rating" },
];

// Lists keep their hand-set order and the anime trackers group by status, so
// a sort bar there would promise something the tab does not do.
const UNSORTED: ReadonlySet<LibraryTab> = new Set<LibraryTab>(["lists", "anilist", "mal"]);

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

export function MobileLibrary({ onConnect }: { onConnect?: () => void }) {
  return (
    <LibraryFeaturedProvider>
      <LibraryScreen onConnect={onConnect} />
    </LibraryFeaturedProvider>
  );
}

function LibraryScreen({ onConnect }: { onConnect?: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<LibraryTab>(readSavedTab);
  const [sort, setSort] = useState<SortState>(readSavedSort);
  const [detailMeta, setDetailMeta] = useState<Meta | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const { settings, update } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: anilistConnected } = useAnilist();
  const { isConnected: malConnected } = useMal();
  const { isConnected: simklConnected } = useSimkl();
  const lb = useLetterboxd();
  const { data, connected } = useLibraryData();
  const native = isMobileNative();
  const featured = useLibraryFeatured();

  useEffect(() => writeSavedTab(tab), [tab]);
  useEffect(() => writeSavedSort(sort), [sort]);

  // Same rule as desktop: a tracker tab disappears with its connection, and
  // whoever was sitting on it lands back on Library.
  useEffect(() => {
    const gone =
      (tab === "trakt" && !traktConnected) ||
      (tab === "anilist" && !anilistConnected) ||
      (tab === "mal" && !malConnected) ||
      (tab === "simkl" && !simklConnected) ||
      (tab === "letterboxd" && !lb.isActive);
    if (gone) setTab("library");
  }, [tab, traktConnected, anilistConnected, malConnected, simklConnected, lb.isActive]);

  const gridKind: GridKind | null =
    tab === "library" ||
    tab === "watchlist" ||
    tab === "history" ||
    tab === "local" ||
    tab === "mediaServers"
      ? tab
      : null;
  const base = gridKind ? data[gridKind] : null;
  const showRating = useMemo(() => (base ? hasRatings(base.entries) : false), [base]);
  // Fall back to the default key if a stale saved "rating" choice has no
  // ratings to sort by in the current tab.
  const effectiveSort = sort.key === "rating" && !showRating ? DEFAULT_SORT : sort;
  const active = useMemo<SectionState | null>(
    () => (base ? { entries: sortEntries(base.entries, effectiveSort), loading: base.loading } : null),
    [base, effectiveSort],
  );

  const slides = useMemo(
    () => (settings.libraryHero ? pickFeatured(featured, tab) : []),
    [settings.libraryHero, featured, tab],
  );

  const needsDesktop = native && !connected && !!onConnect;
  const connectHint = needsDesktop ? <ConnectHint onConnect={onConnect!} /> : null;

  let body: ReactNode;
  if (gridKind && active) {
    body = (
      <GridBody
        kind={gridKind}
        state={active}
        onOpen={setDetailMeta}
        emptyAction={gridKind === "local" || gridKind === "mediaServers" ? connectHint : null}
      />
    );
  } else if (tab === "favorites") {
    body = (
      <MobileFavoritesTab
        sort={effectiveSort}
        remote={data.favorites.entries}
        remoteLoading={data.favorites.loading}
        onOpenDetail={setDetailMeta}
      />
    );
  } else if (tab === "lists") {
    body = <MobileMyListsTab onOpenDetail={setDetailMeta} />;
  } else if (tab === "trakt" && traktConnected) {
    body = <MobileTraktTab sort={effectiveSort} onOpenDetail={setDetailMeta} />;
  } else if (tab === "simkl" && simklConnected) {
    body = <MobileSimklTab sort={effectiveSort} onOpenDetail={setDetailMeta} />;
  } else if (tab === "letterboxd" && lb.isActive) {
    body = <MobileLetterboxdTab sort={effectiveSort} onOpenDetail={setDetailMeta} />;
  } else if (tab === "anilist" && anilistConnected) {
    body = <MobileAnilistTab onOpenDetail={setDetailMeta} />;
  } else if (tab === "mal" && malConnected) {
    body = <MobileMalTab onOpenDetail={setDetailMeta} />;
  }

  return (
    <div
      className="flex flex-col gap-5 px-5"
      style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)" }}
    >
      <style>{VIEW_SWAP_CSS}</style>
      <header className="flex items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-ink-subtle">
            {t("My library")}
          </span>
          <h1 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">
            {t("Your collection")}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <HeaderButton
            label={t("Show a featured banner at the top of your library")}
            pressed={settings.libraryHero}
            onClick={() => update({ libraryHero: !settings.libraryHero })}
          >
            <SetIcon name={settings.libraryHero ? "Eye" : "EyeOff"} size={18} strokeWidth={2} />
          </HeaderButton>
          {settings.wrappedButton && (
            <HeaderButton label={t("Stats")} onClick={() => setStatsOpen(true)}>
              <BarChart3 size={18} strokeWidth={2} />
            </HeaderButton>
          )}
        </div>
      </header>

      {slides.length >= 2 && <FeaturedRail items={slides} onOpen={setDetailMeta} />}

      <TabStrip
        tab={tab}
        onTab={setTab}
        trakt={traktConnected}
        anilist={anilistConnected}
        mal={malConnected}
        simkl={simklConnected}
        letterboxd={lb.isActive}
      />
      {!UNSORTED.has(tab) && (
        <SortBar sort={effectiveSort} onSort={setSort} showRating={showRating} />
      )}
      <div key={tab} className="ml-view-in">
        {body}
      </div>
      {/* A linked desktop is additive, not required: the tabs above are built on
          this device. Offer the link only as a way to merge a desktop library. */}
      {needsDesktop && gridKind && gridKind !== "local" && gridKind !== "mediaServers" &&
        (active?.entries.length ?? 0) > 0 && connectHint}
      {detailMeta && <MobileDetail meta={detailMeta} onClose={() => setDetailMeta(null)} />}
      {statsOpen && <MobileWrappedPage onClose={() => setStatsOpen(false)} />}
    </div>
  );
}

function HeaderButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={`no-press flex h-11 w-11 items-center justify-center rounded-full ring-1 transition-[color,background-color,transform] active:scale-[0.94] motion-reduce:transition-none ${
        pressed
          ? "bg-ink text-canvas ring-transparent"
          : "bg-elevated/60 text-ink-muted ring-edge-soft/60"
      }`}
    >
      {children}
    </button>
  );
}

function TabStrip({
  tab,
  onTab,
  trakt,
  anilist,
  mal,
  simkl,
  letterboxd,
}: {
  tab: LibraryTab;
  onTab: (t: LibraryTab) => void;
  trakt: boolean;
  anilist: boolean;
  mal: boolean;
  simkl: boolean;
  letterboxd: boolean;
}) {
  const t = useT();
  const refs = useRef<Map<LibraryTab, HTMLButtonElement>>(new Map());
  const logo = (src: string, rounded = false) => (
    <img
      src={src}
      alt=""
      draggable={false}
      className={`h-4 w-4 object-contain ${rounded ? "rounded-[3px]" : ""}`}
    />
  );
  // Desktop order and desktop art; tracker tabs only appear while connected.
  const items: Array<{ id: LibraryTab; label: string; icon: ReactNode }> = [
    { id: "library", label: t("Library"), icon: <SetIcon name="Library" size={16} strokeWidth={2.2} /> },
    { id: "watchlist", label: t("Watchlist"), icon: <SetIcon name="Bookmark" size={16} strokeWidth={2.2} /> },
    { id: "history", label: t("History"), icon: <SetIcon name="History" size={16} strokeWidth={2.2} /> },
    { id: "local", label: t("Local"), icon: <SetIcon name="HardDrive" size={16} strokeWidth={2.2} /> },
    { id: "mediaServers", label: t("Media Servers"), icon: <SetIcon name="Server" size={16} strokeWidth={2.2} /> },
    { id: "lists", label: t("My Lists"), icon: <UiIcon name="list" className="h-4 w-4" /> },
    { id: "favorites", label: t("Favorites"), icon: <SetIcon name="Star" size={16} strokeWidth={2.2} /> },
  ];
  if (trakt) items.push({ id: "trakt", label: "Trakt", icon: logo(traktLogo) });
  if (anilist) items.push({ id: "anilist", label: "AniList", icon: logo(anilistLogo, true) });
  if (mal) items.push({ id: "mal", label: "MAL", icon: <MalLogo className="h-4 w-4" /> });
  if (simkl) items.push({ id: "simkl", label: "Simkl", icon: logo(simklLogo) });
  if (letterboxd) items.push({ id: "letterboxd", label: "Letterboxd", icon: logo(letterboxdLogo, true) });

  // A restored tab far down the strip would otherwise sit off screen with
  // nothing showing which tab the grid belongs to.
  useEffect(() => {
    refs.current.get(tab)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [tab]);

  return (
    <div
      role="tablist"
      aria-label={t("My library")}
      className="-mx-5 flex items-center gap-1.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((s) => {
        const on = s.id === tab;
        return (
          <button
            key={s.id}
            ref={(el) => {
              if (el) refs.current.set(s.id, el);
              else refs.current.delete(s.id);
            }}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onTab(s.id)}
            className={`flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition-colors duration-200 active:scale-[0.97] motion-reduce:transition-none ${
              on ? "bg-ink text-canvas" : "bg-surface text-ink-muted ring-1 ring-edge-soft"
            }`}
          >
            {s.icon}
            {s.label}
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
  return (
    <div className="flex items-center justify-end gap-1.5">
      <div
        role="tablist"
        aria-label={t("Sort by")}
        className="inline-flex rounded-full bg-elevated/60 ring-1 ring-edge-soft/60"
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
              className={`h-11 rounded-full px-4 text-[12.5px] font-semibold transition-[color,background-color,transform] active:scale-[0.97] motion-reduce:transition-none ${
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
        className="no-press grid h-11 w-11 shrink-0 place-items-center rounded-full bg-elevated/60 text-ink-muted ring-1 ring-edge-soft/60 transition-transform active:scale-[0.94] motion-reduce:transition-none"
      >
        <SetIcon name={asc ? "ArrowUp" : "ArrowDown"} size={16} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function GridBody({
  kind,
  state,
  onOpen,
  emptyAction,
}: {
  kind: GridKind;
  state: SectionState;
  onOpen: (m: Meta) => void;
  emptyAction: ReactNode;
}) {
  const t = useT();
  useReportFeatured(useMemo(() => state.entries.map((e) => e.meta), [state.entries]));
  if (state.loading && state.entries.length === 0) return <SkeletonGrid />;
  if (state.entries.length === 0) {
    const cfg = EMPTY[kind];
    return (
      <EmptyState
        art={<SetIcon name={cfg.icon} size={26} strokeWidth={1.8} />}
        title={t(cfg.title)}
        body={t(cfg.body)}
        action={emptyAction}
      />
    );
  }
  return (
    <PhoneGrid>
      {state.entries.map((e) => (
        <GridTile key={e.meta.id} meta={e.meta} onOpen={onOpen} />
      ))}
    </PhoneGrid>
  );
}

function ConnectHint({ onConnect }: { onConnect: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onConnect}
      className="flex min-h-11 items-center justify-center gap-2 rounded-full border border-edge-soft bg-surface/60 px-4 py-2.5 text-[12.5px] font-semibold text-ink-muted transition-colors active:bg-raised/60"
    >
      <SetIcon name="Link2" size={14} strokeWidth={2.4} />
      {t("Connect a computer to merge its library")}
    </button>
  );
}

function parseDate(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Date.parse(v);
    return Number.isFinite(n) ? n : 0;
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
    meta: {
      id: e.id,
      type: e.type,
      name: e.name || e.id,
      poster: e.poster,
      addonOrigin: e.addonOrigin,
      videos: e.videos,
    },
    date: e.addedAt || 0,
  };
}

function watchedToEntry(e: LocalWatchedEntry): Entry {
  return { meta: { id: e.id, type: e.type, name: e.name, poster: e.poster }, date: e.at || 0 };
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

// Builds the grid sections on-device, 1:1 with the desktop tabs:
//   library   = Stremio cloud library + local saved + Trakt watchlist + snapshot
//   watchlist = the same sources minus anything started or watched
//   history   = Stremio cloud + local continue-watching + on-device watched
//               marks + Trakt + desktop snapshot (the tracker merge)
//   favorites = the desktop snapshot's favorites (the tab adds local ones)
// A connected desktop is merged in additively; it is never required.
function useLibraryData(): {
  data: Record<GridKind | "favorites", SectionState>;
  connected: boolean;
} {
  const { authKey } = useAuth();
  const { settings } = useSettings();
  const { isConnected: traktConnected } = useTrakt();
  const { snapshot, connected } = useMobileRemote();
  const remoteLib = snapshot.library;
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
    const bookmarkedOnly = !!settings.libraryBookmarkedOnly;
    const saved = localWatch.map(localToEntry);
    const traktSaved = traktWl.map(traktWatchlistToEntry).filter((e): e is Entry => e !== null);
    const remoteSaved = remoteToEntries(remoteLib?.watchlist);

    const libraryAll = dedupEntries([
      filterLibrary(stremio, bookmarkedOnly, "library").map((i) => libToEntry(i, "mtime")),
      saved,
      traktSaved,
      remoteSaved,
    ]);

    const watchlist = dedupEntries([
      filterLibrary(stremio, bookmarkedOnly, "watchlist").map((i) => libToEntry(i, "mtime")),
      saved,
      traktSaved,
      remoteSaved,
    ]);

    const history = dedupEntries([
      filterHistory(stremio).map((i) => libToEntry(i, "watched")),
      localCw.map((i) => libToEntry(i, "watched")),
      localWatched.map(watchedToEntry),
      traktHist.map(traktHistoryToEntry).filter((e): e is Entry => e !== null),
      remoteToEntries(remoteLib?.history),
    ]);

    return {
      connected,
      data: {
        library: { entries: libraryAll, loading: baseLoading },
        watchlist: { entries: watchlist, loading: baseLoading },
        history: { entries: history, loading: baseLoading },
        favorites: { entries: remoteToEntries(remoteLib?.favorites), loading: remotePending },
        // Both only exist on the connected desktop, so they track the remote
        // payload rather than the merged local/cloud sources above.
        local: { entries: remoteToEntries(remoteLib?.local), loading: remotePending },
        mediaServers: {
          entries: remoteToEntries(remoteLib?.mediaServers),
          loading: remotePending,
        },
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
    localCw,
    localWatch,
    localWatched,
    settings.libraryBookmarkedOnly,
  ]);
}
