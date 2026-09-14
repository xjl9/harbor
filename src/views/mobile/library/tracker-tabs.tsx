import { useEffect, useMemo, useState } from "react";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { sortEntries, type SortState } from "@/lib/library/sort";
import {
  getLocalCache,
  syncWatchlistCache,
  type SimklCache,
  type SimklCacheItem,
} from "@/lib/simkl/activities";
import {
  enhanceGroupsWithRelations,
  formatYearRange,
  groupAnimeByFranchise,
  type AnimeFranchise,
} from "@/lib/simkl/anime-grouping";
import { fetchFullModeCatalog, fetchStremboxdCatalog } from "@/lib/stremboxd/client";
import { useLetterboxd } from "@/lib/stremboxd/provider";
import { stremboxdMetaToMeta } from "@/lib/stremboxd/to-meta";
import { fetchWatchedHistory, type HistoryItem } from "@/lib/trakt/history";
import { traktItemToMeta } from "@/lib/trakt/to-meta";
import type { TraktItem } from "@/lib/trakt/types";
import { fetchWatchlist } from "@/lib/trakt/watchlist";
import { useReportFeatured } from "@/views/library/featured-context";
import { historyItemsToDated } from "@/views/library/history-merge";
import { applyFilter, countByType, parseTs } from "@/views/library/shared";
import {
  ChipRow,
  GridTile,
  PhoneGrid,
  SectionHeading,
  SkeletonGrid,
  StatusNote,
  TypePills,
  type TypeKey,
} from "./grid";

// Trakt, Simkl and Letterboxd tabs over the desktop fetchers, rendered as phone
// grids. The desktop tabs group by date under the settings sort; the phone
// keeps its own sort control (recent, title, rating) so every tab here answers
// to the same bar as the on-device tabs.

type Entry = { meta: Meta; date: number };
type Status = "loading" | "ready" | "error";

type TabProps = { sort: SortState; onOpenDetail: (m: Meta) => void };

function TrackerSection({
  title,
  shown,
  total,
  loading,
  emptyText,
  entries,
  onOpen,
}: {
  title: string;
  shown: number;
  total: number;
  loading: boolean;
  emptyText: string;
  entries: Entry[];
  onOpen: (m: Meta) => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <SectionHeading title={title} count={t("{shown} of {total}", { shown, total })} />
      {loading ? (
        <SkeletonGrid count={6} />
      ) : entries.length === 0 ? (
        <StatusNote>{total === 0 ? emptyText : t("No matches for these filters.")}</StatusNote>
      ) : (
        <PhoneGrid>
          {entries.map((e) => (
            <GridTile key={e.meta.id} meta={e.meta} onOpen={onOpen} />
          ))}
        </PhoneGrid>
      )}
    </div>
  );
}

export function MobileTraktTab({ sort, onOpenDetail }: TabProps) {
  const t = useT();
  const [watchlist, setWatchlist] = useState<TraktItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [type, setType] = useState<TypeKey>("all");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    Promise.all([fetchWatchlist(), fetchWatchedHistory(200)])
      .then(([w, h]) => {
        if (cancelled) return;
        setWatchlist(w);
        setHistory(h);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const wl = useMemo<Entry[]>(
    () =>
      watchlist
        .map((item) => {
          const meta = traktItemToMeta(item);
          return meta ? { meta, date: parseTs(item.contextDate) ?? 0 } : null;
        })
        .filter((e): e is Entry => e !== null),
    [watchlist],
  );
  const hist = useMemo<Entry[]>(
    () => historyItemsToDated(history).map((e) => ({ meta: e.meta, date: e.date ?? 0 })),
    [history],
  );
  const counts = useMemo(() => countByType([...wl, ...hist]), [wl, hist]);
  const visibleW = useMemo(() => sortEntries(applyFilter(wl, type, ""), sort), [wl, type, sort]);
  const visibleH = useMemo(() => sortEntries(applyFilter(hist, type, ""), sort), [hist, type, sort]);
  useReportFeatured(
    useMemo(() => [...visibleW, ...visibleH].map((v) => v.meta), [visibleW, visibleH]),
  );

  return (
    <section className="flex flex-col gap-6">
      {wl.length + hist.length > 0 && <TypePills type={type} onType={setType} counts={counts} />}
      <TrackerSection
        title={t("Trakt watchlist")}
        shown={visibleW.length}
        total={wl.length}
        loading={status === "loading"}
        emptyText={t("Nothing saved on Trakt yet.")}
        entries={visibleW}
        onOpen={onOpenDetail}
      />
      <TrackerSection
        title={t("Trakt history")}
        shown={visibleH.length}
        total={hist.length}
        loading={status === "loading"}
        emptyText={t("No history yet.")}
        entries={visibleH}
        onOpen={onOpenDetail}
      />
      {status === "error" && (
        <StatusNote tone="error">{t("Couldn't reach Trakt. Try refreshing.")}</StatusNote>
      )}
    </section>
  );
}

const SIMKL_STATUS_LABELS: Record<string, string> = {
  watching: "Watching",
  plantowatch: "Plan to Watch",
  completed: "Completed",
  hold: "On Hold",
  dropped: "Dropped",
};

type SimklSub = "movies" | "shows" | "anime";

// Same id resolution as the desktop SimklTab: prefer an IMDb id, then TMDB,
// then MAL and Kitsu, so the phone detail page opens the same title record.
function simklItemToMeta(item: SimklCacheItem, cache: SimklCache): Meta {
  const simklId = item.simklId;
  let id: string | null = null;
  const imdbId = Object.keys(cache.imdbToSimkl).find((k) => cache.imdbToSimkl[k] === simklId);
  if (imdbId) id = imdbId;
  else {
    const tmdbKey = Object.keys(cache.tmdbToSimkl).find((k) => cache.tmdbToSimkl[k] === simklId);
    if (tmdbKey) {
      const parts = tmdbKey.split(":");
      if (parts.length === 2) id = `tmdb:${parts[0]}:${parts[1]}`;
    }
  }
  if (!id) {
    const malId = Object.keys(cache.malToSimkl).find((k) => cache.malToSimkl[k] === simklId);
    if (malId) id = `mal:${malId}`;
  }
  if (!id) {
    const kitsuId = Object.keys(cache.kitsuToSimkl).find((k) => cache.kitsuToSimkl[k] === simklId);
    if (kitsuId) id = `kitsu:${kitsuId}`;
  }
  return {
    id: id ?? `simkl:${simklId}`,
    type: item.type === "movie" ? "movie" : "series",
    name: item.title || "Unknown Title",
    releaseInfo: item.year ? String(item.year) : undefined,
    poster: item.poster ? `https://simkl.in/posters/${item.poster}_m.jpg` : undefined,
  };
}

function isAnimeMovie(item: SimklCacheItem, cache: SimklCache): boolean {
  return (
    Object.values(cache.malToSimkl).includes(item.simklId) ||
    Object.values(cache.kitsuToSimkl).includes(item.simklId)
  );
}

export function MobileSimklTab({ sort, onOpenDetail }: TabProps) {
  const t = useT();
  const [cache, setCache] = useState<SimklCache | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [franchises, setFranchises] = useState<AnimeFranchise[]>([]);
  const [sub, setSub] = useState<SimklSub>("movies");
  const [statusFilter, setStatusFilter] = useState("plantowatch");
  const [type, setType] = useState<TypeKey>("all");

  useEffect(() => {
    let cancelled = false;
    const initial = getLocalCache();
    if (initial) {
      setCache(initial);
      setStatus("ready");
    } else {
      setStatus("loading");
    }
    syncWatchlistCache()
      .then((updated) => {
        if (cancelled) return;
        setCache(updated);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled && !initial) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cache) {
      setFranchises([]);
      return;
    }
    const animeItems = Object.values(cache.items).filter(
      (item) => item.type === "anime" || (item.type === "movie" && isAnimeMovie(item, cache)),
    );
    const grouped = groupAnimeByFranchise(animeItems);
    setFranchises(grouped);
    let cancelled = false;
    enhanceGroupsWithRelations(grouped)
      .then((enhanced) => {
        if (!cancelled) setFranchises(enhanced);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [cache]);

  const allowed = useMemo<string[]>(
    () =>
      sub === "movies"
        ? ["plantowatch", "completed", "dropped"]
        : ["watching", "plantowatch", "completed", "hold", "dropped"],
    [sub],
  );
  useEffect(() => {
    if (!allowed.includes(statusFilter)) setStatusFilter(allowed[0]);
  }, [allowed, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!cache) return counts;
    if (sub === "anime") {
      for (const f of franchises) {
        for (const st of new Set(f.items.map((i) => i.status))) counts[st] = (counts[st] ?? 0) + 1;
      }
      return counts;
    }
    for (const item of Object.values(cache.items)) {
      if (sub === "movies") {
        if (item.type !== "movie" || isAnimeMovie(item, cache)) continue;
      } else if (item.type !== "show") continue;
      counts[item.status] = (counts[item.status] ?? 0) + 1;
    }
    return counts;
  }, [cache, sub, franchises]);

  const items = useMemo<Entry[]>(() => {
    if (!cache) return [];
    if (sub === "anime") {
      return franchises
        .filter((f) => f.items.some((i) => i.status === statusFilter))
        .map((f) => {
          const watching = f.items
            .filter((i) => i.status === "watching")
            .sort(
              (a, b) =>
                (b.watchedAt ? new Date(b.watchedAt).getTime() : 0) -
                (a.watchedAt ? new Date(a.watchedAt).getTime() : 0),
            );
          const rep = watching[0] ?? f.items[0];
          if (!rep) return null;
          const meta = simklItemToMeta(rep, cache);
          meta.name = f.name;
          if (f.yearStart != null) meta.releaseInfo = formatYearRange(f.yearStart, f.yearEnd);
          if (!meta.poster) {
            const withArt = f.items.find((i) => i.poster);
            if (withArt?.poster) meta.poster = `https://simkl.in/posters/${withArt.poster}_m.jpg`;
          }
          const dates = f.items
            .map((i) => i.watchedAt)
            .filter((d): d is string => d != null)
            .sort((a, b) => b.localeCompare(a));
          return { meta, date: dates.length > 0 ? (parseTs(dates[0]) ?? 0) : 0 };
        })
        .filter((e): e is Entry => e !== null);
    }
    return Object.values(cache.items)
      .filter((item) => {
        if (item.status !== statusFilter) return false;
        if (sub === "movies") return item.type === "movie" && !isAnimeMovie(item, cache);
        return item.type === "show";
      })
      .map((item) => ({
        meta: simklItemToMeta(item, cache),
        date: item.watchedAt ? (parseTs(item.watchedAt) ?? 0) : 0,
      }));
  }, [cache, sub, statusFilter, franchises]);

  const counts = useMemo(() => countByType(items), [items]);
  const visible = useMemo(() => sortEntries(applyFilter(items, type, ""), sort), [items, type, sort]);
  useReportFeatured(useMemo(() => visible.map((v) => v.meta), [visible]));

  return (
    <section className="flex flex-col gap-4">
      <ChipRow
        value={sub}
        onChange={setSub}
        ariaLabel={t("Simkl section")}
        options={[
          { value: "movies", label: t("Movies") },
          { value: "shows", label: t("TV Shows") },
          { value: "anime", label: t("Anime") },
        ]}
      />
      <ChipRow
        value={statusFilter}
        onChange={setStatusFilter}
        ariaLabel={t("Status")}
        options={allowed.map((s) => ({
          value: s,
          label: t(SIMKL_STATUS_LABELS[s]),
          count: statusCounts[s] ?? 0,
        }))}
      />
      {items.length > 0 && sub !== "anime" && (
        <TypePills type={type} onType={setType} counts={counts} />
      )}
      {status === "loading" && <SkeletonGrid count={6} />}
      {status === "error" && (
        <StatusNote tone="error">{t("Couldn't reach Simkl. Try refreshing.")}</StatusNote>
      )}
      {status === "ready" && visible.length === 0 && (
        <StatusNote>
          {items.length === 0 ? t("No items found in this section.") : t("No matches for these filters.")}
        </StatusNote>
      )}
      {visible.length > 0 && (
        <PhoneGrid>
          {visible.map((e) => (
            <GridTile key={e.meta.id} meta={e.meta} onOpen={onOpenDetail} sub={e.meta.releaseInfo} />
          ))}
        </PhoneGrid>
      )}
    </section>
  );
}

export function MobileLetterboxdTab({ sort, onOpenDetail }: TabProps) {
  const t = useT();
  const lb = useLetterboxd();
  const [items, setItems] = useState<Entry[]>([]);
  const [status, setStatus] = useState<Status>("loading");
  const [type, setType] = useState<TypeKey>("all");

  useEffect(() => {
    if (!lb.isActive) {
      setItems([]);
      setStatus("ready");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setItems([]);
    const catalogId = "letterboxd-watchlist";
    const session = lb.session;
    (session
      ? fetchFullModeCatalog(session.userId, catalogId, 0)
      : fetchStremboxdCatalog(lb.configSegment, catalogId, 0)
    )
      .then((page) => {
        if (cancelled) return;
        setItems(page.metas.map((m) => ({ meta: stremboxdMetaToMeta(m), date: 0 })));
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [lb.isActive, lb.session, lb.configSegment]);

  const counts = useMemo(() => countByType(items), [items]);
  const visible = useMemo(() => sortEntries(applyFilter(items, type, ""), sort), [items, type, sort]);
  useReportFeatured(useMemo(() => visible.map((v) => v.meta), [visible]));

  return (
    <section className="flex flex-col gap-4">
      {items.length > 0 && <TypePills type={type} onType={setType} counts={counts} />}
      {status === "loading" && <SkeletonGrid count={6} />}
      {status === "error" && (
        <StatusNote tone="error">{t("Couldn't reach Letterboxd. Try refreshing.")}</StatusNote>
      )}
      {status === "ready" && items.length === 0 && (
        <StatusNote>{t("Your Letterboxd watchlist is empty.")}</StatusNote>
      )}
      {status === "ready" && visible.length === 0 && items.length > 0 && (
        <StatusNote>{t("No matches for these filters.")}</StatusNote>
      )}
      {visible.length > 0 && (
        <PhoneGrid>
          {visible.map((e) => (
            <GridTile key={e.meta.id} meta={e.meta} onOpen={onOpenDetail} />
          ))}
        </PhoneGrid>
      )}
    </section>
  );
}
