import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Check, Download, Loader2, Pause, RotateCw, X } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import {
  tmdbSeasonEpisodes,
  type Episode,
  type Season,
  type TmdbDetail,
} from "@/lib/providers/tmdb";
import { seasonDateRange } from "@/lib/providers/tvdb-order";
import { useEpisodeOrder } from "@/views/detail/series-episodes/use-episode-order";
import { useEpisodeEnrich } from "@/views/detail/series-episodes/use-episode-enrich";
import { useSeriesTvdbStills } from "@/views/detail/series-episodes/use-series-tvdb-stills";
import { useTvdbSeasonTypes } from "@/views/detail/series-episodes/use-tvdb-season-types";
import { useWatchedSets } from "@/views/detail/series-episodes/use-watched-sets";
import { useMarkSeason } from "@/views/detail/series-episodes/use-mark-season";
import { useSettings } from "@/lib/settings";
import { effectiveOrderProvider } from "@/lib/settings/episode-order";
import { t as translate, useT, useUiLanguage } from "@/lib/i18n";
import { setViewedSeason } from "@/lib/season-view-pref";
import {
  getEpisodeProgress,
  resumeDefaultSeason,
  type EpisodeProgress,
} from "@/lib/episode-progress";
import { manualEpisodeKeys, manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { spoilerMaskFor } from "@/lib/spoilers";
import { useStremioWatched } from "@/lib/use-stremio-watched";
import { useTrakt } from "@/lib/trakt/provider";
import { useSimkl } from "@/lib/simkl/provider";
import { isMobileNative } from "@/lib/platform";
import { useView, type PlayEpisode } from "@/lib/view";
import { cancelDownload, useDownloads, type DownloadItem } from "@/lib/download/downloads-store";
import { pendingSeasonEpisodes } from "@/lib/download/season-download";
import { useIsAutoDownloaded } from "@/lib/auto-download";
import { airedOnly } from "@/lib/aired";
import { scrollToDataEp } from "@/lib/episode-scroll";
import { useMobileRemote } from "../mobile-remote";
import { HIDE_SCROLL, stillFrom, tmdbTvId, useEpisodeWindow, type Ep } from "./data";
import { SectionTitle } from "./ui";
import { EpisodeItem, EpisodeSkeleton } from "./episode-item";
import { OrderStyleSwitch, type OrderOption } from "./order-switch";
import { SeasonPicker, type SeasonSheetItem } from "./season-sheet";
import {
  EpisodeCard,
  EpisodeDownloadsSheet,
  EpisodeOptionsSheet,
  EpisodePager,
  EpisodeSearchField,
  EpisodeToolbar,
  GoToEpisode,
  pickRandomEpisode,
} from "./episode-layouts";
import { SheetRow } from "./sheet-ui";
import { PhoneSheet, useSheetClose } from "./sheets";

// Same page size as desktop's episode grid. The strip shares it because a
// sideways scroller never crosses the vertical sentinel the list grows on.
const CARD_PAGE = 50;

function seasonTypeBadge(seasonNumber: number, label: string): string | undefined {
  const n = label.toLowerCase();
  if (/\bo[vn]a\b/.test(n)) return "OVA";
  if (/movie|film/.test(n)) return "Movie";
  if (seasonNumber <= 0 || /special/.test(n)) return "Special";
  return undefined;
}

export function EpisodeSection({
  meta,
  full,
  detail,
  tmdbKey,
  seasons,
  onPlay,
  onOpenEpisode,
}: {
  meta: Meta;
  full: Meta | null;
  detail: TmdbDetail | null;
  tmdbKey: string;
  seasons: number[];
  onPlay: (ep: Ep) => void;
  onOpenEpisode: (ep: Ep) => void;
}) {
  const t = useT();
  const language = useUiLanguage();
  const { settings, update } = useSettings();
  const { snapshot } = useMobileRemote();
  const { openPicker } = useView();
  const downloads = useDownloads();
  const canDownload = isMobileNative();
  const autoDownload = useIsAutoDownloaded(meta.id);
  const tvdbKey = settings.tvdbKey || snapshot.tvdbKey || "";
  const imdbId = detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);

  const settingsProvider = effectiveOrderProvider(settings);
  const [override, setOverride] = useState<{
    provider: "default" | "tvdb";
    seasonType: string;
  } | null>(null);
  useEffect(() => {
    setOverride(null);
  }, [meta.id]);
  const effProvider = override?.provider ?? settingsProvider;
  const effSeasonType = override?.seasonType ?? settings.tvdbSeasonType;

  const ordering = useEpisodeOrder(imdbId, meta.id, effProvider, effSeasonType, tvdbKey);

  const orderTypes = useTvdbSeasonTypes(imdbId, meta.id, tvdbKey, !!tvdbKey);
  const orderOptions = useMemo<OrderOption[]>(() => {
    if (orderTypes.length === 0) return [];
    const base: OrderOption[] = orderTypes.map((o) => ({ value: o.value, label: o.label }));
    return settings.tmdbKey ? [...base, { value: "tmdb", label: "TMDB" }] : base;
  }, [orderTypes, settings.tmdbKey]);
  const activeOrder = effProvider === "tvdb" && effSeasonType !== "tmdb" ? effSeasonType : "tmdb";
  const pickOrder = (value: string) => {
    if (value === "tmdb") setOverride({ provider: "default", seasonType: "tmdb" });
    else setOverride({ provider: "tvdb", seasonType: value });
  };

  const seasonItems = useMemo<SeasonSheetItem[]>(() => {
    if (ordering) {
      return ordering.seasons.map((s) => {
        const label =
          s.name && s.name.trim()
            ? s.name
            : translate("Season {number}", { number: s.seasonNumber });
        const { from, to } = seasonDateRange(ordering.bySeason.get(s.seasonNumber) ?? []);
        return {
          key: String(s.seasonNumber),
          name: label,
          count: s.episodeCount,
          year: s.airDate?.slice(0, 4),
          from,
          to,
          extra: s.seasonNumber <= 0,
          badge: seasonTypeBadge(s.seasonNumber, label),
        };
      });
    }
    return seasons.map((n) => {
      const s = detail?.seasons?.find((x) => x.seasonNumber === n);
      const label =
        s?.name && s.name.trim() ? s.name : translate("Season {number}", { number: n });
      return {
        key: String(n),
        name: label,
        count: s?.episodeCount,
        year: s?.airDate?.slice(0, 4),
        badge: seasonTypeBadge(n, label),
      };
    });
  }, [ordering, seasons, detail?.seasons, language]);

  const { isConnected: traktConnected } = useTrakt();
  const { isConnected: simklConnected } = useSimkl();
  const mwVersion = useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);
  const { traktWatched, simklWatched } = useWatchedSets({
    traktConnected,
    simklConnected,
    imdbId,
    metaId: meta.id,
  });
  const stremioWatched = useStremioWatched(meta.id, detail?.imdbId, full?.videos);
  const combinedWatched = useMemo(() => {
    const s = new Set<string>(stremioWatched);
    for (const k of simklWatched) s.add(k);
    for (const k of traktWatched) {
      const e = k.lastIndexOf(":");
      const se = e > 0 ? k.lastIndexOf(":", e - 1) : -1;
      if (se >= 0) s.add(k.slice(se + 1));
    }
    const manual = manualEpisodeKeys(meta.id);
    for (const k of manual.watched) s.add(k);
    for (const k of manual.unwatched) s.delete(k);
    return s;
  }, [stremioWatched, simklWatched, traktWatched, meta.id, mwVersion]);

  const [season, setSeason] = useState<number>(() =>
    resumeDefaultSeason(
      meta.id,
      seasons.map((n) => ({ seasonNumber: n, episodeCount: 0 })),
    ),
  );
  const userPickedRef = useRef(false);
  useEffect(() => {
    userPickedRef.current = false;
  }, [meta.id]);
  const seasonMetaList = useMemo(() => {
    if (ordering) return ordering.seasons;
    if (detail?.seasons?.length) return detail.seasons;
    return seasons.map((n) => ({ seasonNumber: n, episodeCount: 0 }));
  }, [ordering, detail?.seasons, seasons]);
  useEffect(() => {
    if (userPickedRef.current) return;
    const def = resumeDefaultSeason(meta.id, seasonMetaList, combinedWatched);
    if (seasonItems.some((o) => o.key === String(def))) setSeason(def);
  }, [meta.id, seasonMetaList, combinedWatched, seasonItems]);
  useEffect(() => {
    setSeason((s) => (seasonItems.some((o) => o.key === String(s)) ? s : Number(seasonItems[0]?.key ?? 1)));
  }, [seasonItems]);
  const pickSeason = (n: number) => {
    userPickedRef.current = true;
    setViewedSeason(meta.id, n);
    setSeason(n);
  };

  const tvId = tmdbTvId(meta, detail);
  const [tmdbEps, setTmdbEps] = useState<Episode[]>([]);
  const [loadingEps, setLoadingEps] = useState(false);
  useEffect(() => {
    setTmdbEps([]);
    if (ordering) {
      setLoadingEps(false);
      return;
    }
    if (!tmdbKey || tvId == null) return;
    let alive = true;
    setLoadingEps(true);
    tmdbSeasonEpisodes(tmdbKey, tvId, season)
      .then((eps) => {
        if (!alive) return;
        setTmdbEps(eps);
        setLoadingEps(false);
      })
      .catch(() => {
        if (alive) setLoadingEps(false);
      });
    return () => {
      alive = false;
    };
  }, [ordering, tmdbKey, tvId, season]);

  // TVDB text enrich plus keyless harbor IMDb ratings; OMDb stays off (no key
  // on mobile, empty key disables that half of the hook).
  const { episodes: enrichedTmdbEps, imdbRatings } = useEpisodeEnrich({
    episodes: tmdbEps,
    active: season,
    imdbId,
    tvdbKey,
    omdbKey: "",
    metaId: meta.id,
    preferCustomMeta: settings.preferCustomMetaAddon,
  });

  const baseEpisodes = useMemo<Ep[]>(() => {
    if (ordering) {
      // Cinemeta stills fill the gaps where a TVDB-ordered entry has no image,
      // matching desktop's ordered rows (which fall back the same way).
      const videoThumb = new Map<string, string>();
      for (const v of full?.videos ?? []) {
        if (typeof v.episode === "number" && v.thumbnail)
          videoThumb.set(`${v.season}:${v.episode}`, v.thumbnail);
      }
      return (ordering.bySeason.get(season) ?? []).map((e) => ({
        season: e.seasonNumber,
        episode: e.episodeNumber,
        name: e.name || undefined,
        still: stillFrom(e.stillPath, e.stillUrl) ?? videoThumb.get(`${e.seasonNumber}:${e.episodeNumber}`),
        overview: e.overview || undefined,
        runtime: e.runtime,
        airDate: e.airDate,
        imdbRating: e.imdbRating ?? undefined,
      }));
    }
    const byNum = new Map<number, Ep>();
    for (const v of full?.videos ?? []) {
      if (v.season !== season || typeof v.episode !== "number") continue;
      byNum.set(v.episode, {
        season,
        episode: v.episode,
        name: v.name || v.title,
        still: v.thumbnail,
        overview: v.overview || v.description,
        airDate: v.released || v.firstAired,
      });
    }
    for (const e of enrichedTmdbEps) {
      const prev = byNum.get(e.episodeNumber);
      byNum.set(e.episodeNumber, {
        season,
        episode: e.episodeNumber,
        name: prev?.name || e.name || undefined,
        still: prev?.still || stillFrom(e.stillPath, e.stillUrl),
        overview: prev?.overview || e.overview || undefined,
        runtime: e.runtime,
        airDate: prev?.airDate || e.airDate,
        imdbRating: e.imdbRating ?? undefined,
      });
    }
    return [...byNum.values()].sort((a, b) => a.episode - b.episode);
  }, [ordering, season, full?.videos, enrichedTmdbEps]);

  const tvdbStills = useSeriesTvdbStills(imdbId, baseEpisodes.length, settings.tvdbSeasonType);
  const episodes = useMemo<Ep[]>(() => {
    const hasStills = Object.keys(tvdbStills).length > 0;
    if (!hasStills && imdbRatings.size === 0) return baseEpisodes;
    return baseEpisodes.map((ep) => {
      let next = ep;
      if (!next.still && hasStills) {
        const img = tvdbStills[`s${ep.season}e${ep.episode}`] ?? tvdbStills[`abs${ep.episode}`];
        if (img) next = { ...next, still: img };
      }
      if (next.imdbRating == null) {
        const r = imdbRatings.get(`${ep.season}:${ep.episode}`);
        if (r != null && r > 0) next = { ...next, imdbRating: r };
      }
      return next;
    });
  }, [baseEpisodes, tvdbStills, imdbRatings]);

  // Pair-keyed rather than useEpisodeProgressMap: absolute orderings fold every
  // canonical season into one list, so episodeNumber alone collides.
  const traktKey = imdbId ?? meta.id;
  const progressByKey = useMemo(() => {
    const m = new Map<string, EpisodeProgress>();
    for (const ep of episodes) {
      m.set(
        `${ep.season}:${ep.episode}`,
        getEpisodeProgress(
          meta.id,
          ep.season,
          ep.episode,
          ep.runtime ?? null,
          traktKey,
          traktWatched,
          stremioWatched,
          undefined,
          simklWatched,
        ),
      );
    }
    return m;
  }, [episodes, meta.id, traktKey, traktWatched, stremioWatched, simklWatched, mwVersion]);
  const nextUpKey = useMemo(() => {
    for (const ep of episodes) {
      const k = `${ep.season}:${ep.episode}`;
      if (!progressByKey.get(k)?.watched) return k;
    }
    return null;
  }, [episodes, progressByKey]);

  // ---- Desktop episode panel controls -------------------------------------
  const layout = settings.episodeLayout;
  const sort = settings.episodeSort;
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheet, setSheet] = useState<"options" | "downloads" | null>(null);
  const [page, setPage] = useState(0);
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setQuery("");
    setSearchOpen(false);
  }, [meta.id]);
  useEffect(() => setPage(0), [meta.id, season, sort, layout, effProvider, effSeasonType]);

  const displayed = useMemo(
    () => (sort === "newest" ? episodes.slice().reverse() : episodes),
    [episodes, sort],
  );

  // Desktop searches every season through the Cinemeta video list. An
  // alternate TVDB order numbers episodes differently from Cinemeta, so under
  // one the search stays inside the list that is actually on screen.
  const q = query.trim().toLowerCase();
  const searchResults = useMemo<Ep[] | null>(() => {
    if (!q) return null;
    const hit = (name: string | undefined, s: number, e: number) =>
      (name ?? "").toLowerCase().includes(q) || String(e).includes(q) || `s${s}e${e}`.includes(q);
    const videos = (full?.videos ?? []).filter(
      (v) => typeof v.season === "number" && v.season >= 1 && typeof v.episode === "number",
    );
    if (!ordering && videos.length > 0) {
      return videos
        .filter((v) => hit(v.name || v.title, v.season!, v.episode!))
        .sort((a, b) => a.season! - b.season! || a.episode! - b.episode!)
        .map((v) => ({
          season: v.season!,
          episode: v.episode!,
          name: v.name || v.title,
          still: v.thumbnail,
          overview: v.overview || v.description,
          airDate: v.released || v.firstAired,
        }));
    }
    return episodes.filter((ep) => hit(ep.name, ep.season, ep.episode));
  }, [q, full?.videos, episodes, ordering]);

  const markEpisodes = useMemo<Episode[]>(
    () =>
      episodes.map((ep) => ({
        id: ep.season * 100000 + ep.episode,
        episodeNumber: ep.episode,
        seasonNumber: ep.season,
        name: ep.name ?? "",
        overview: ep.overview ?? "",
        stillPath: null,
        airDate: ep.airDate ?? null,
        runtime: ep.runtime ?? null,
        voteAverage: null,
      })),
    [episodes],
  );
  const markSeason = useMarkSeason({
    meta,
    active: season,
    enrichedEpisodes: markEpisodes,
    simklConnected,
  });
  const allWatched = useMemo(() => {
    const aired = airedOnly(episodes, (e) => e.airDate);
    return (
      aired.length > 0 &&
      aired.every((ep) => progressByKey.get(`${ep.season}:${ep.episode}`)?.watched)
    );
  }, [episodes, progressByKey]);

  const randomSeasons: Season[] = ordering?.seasons ?? detail?.seasons ?? [];
  const onRandom =
    randomSeasons.length > 0
      ? () => {
          const pick = pickRandomEpisode(randomSeasons);
          if (pick) onPlay({ season: pick.season, episode: pick.episode });
        }
      : null;

  const seasonPlayEpisodes = useMemo<PlayEpisode[]>(
    () =>
      episodes.map((ep) => ({
        season: ep.season,
        episode: ep.episode,
        name: ep.name,
        runtime: ep.runtime ?? undefined,
      })),
    [episodes],
  );
  const pending = canDownload ? pendingSeasonEpisodes(meta.id, seasonPlayEpisodes) : [];

  const { renderCount, hasMore, sentinelRef, reveal } = useEpisodeWindow(
    displayed.length,
    `${meta.id}|${season}|${effProvider}|${effSeasonType}|${sort}|${layout}`,
  );
  const pageCount = Math.max(1, Math.ceil(displayed.length / CARD_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const maxEpisode = useMemo(() => episodes.reduce((m, e) => (e.episode > m ? e.episode : m), 0), [episodes]);

  const scroller = () => sectionRef.current?.closest<HTMLElement>("[data-md-scroll]") ?? null;
  const goToEpisode = (n: number) => {
    const idx = displayed.findIndex((e) => e.episode === n);
    if (idx < 0) return;
    if (layout === "list") reveal(idx);
    else setPage(Math.floor(idx / CARD_PAGE));
    scrollToDataEp(scroller(), n, { center: true });
  };
  const changePage = (p: number) => {
    setPage(p);
    requestAnimationFrame(() =>
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  if (seasonItems.length === 0) return null;

  const downloadFor = (ep: Ep) =>
    canDownload
      ? downloads.find(
          (d) => d.metaId === meta.id && d.season === ep.season && d.episode === ep.episode,
        )
      : undefined;
  const startDownload = (ep: Ep) =>
    openPicker(meta, { season: ep.season, episode: ep.episode }, { intent: "download" });
  const progressOf = (ep: Ep) =>
    progressByKey.get(`${ep.season}:${ep.episode}`) ?? { ratio: 0, watched: false, startedAt: 0 };
  const spoilerOf = (ep: Ep) => {
    const key = `${ep.season}:${ep.episode}`;
    return spoilerMaskFor(settings, {
      watched: progressOf(ep).watched,
      isNextUp: key === nextUpKey,
    });
  };

  const row = (ep: Ep) => {
    const key = `${ep.season}:${ep.episode}`;
    return (
      <EpisodeItem
        key={key}
        ep={ep}
        onPlay={onPlay}
        onInfo={onOpenEpisode}
        progress={progressOf(ep)}
        spoiler={spoilerOf(ep)}
        nextUp={key === nextUpKey}
        showRating={settings.showEpisodeRating}
        download={
          canDownload ? (
            <EpisodeDownloadControl
              ep={ep}
              item={downloadFor(ep)}
              onDownload={() => startDownload(ep)}
            />
          ) : undefined
        }
      />
    );
  };
  const card = (ep: Ep, className: string) => {
    const key = `${ep.season}:${ep.episode}`;
    return (
      <EpisodeCard
        key={key}
        ep={ep}
        className={className}
        progress={progressOf(ep)}
        spoiler={spoilerOf(ep)}
        nextUp={key === nextUpKey}
        showRating={settings.showEpisodeRating}
        showDescription={layout === "grid" && settings.showEpisodeDescription}
        onPlay={onPlay}
        onInfo={onOpenEpisode}
        trailing={
          canDownload ? (
            <EpisodeDownloadControl
              ep={ep}
              item={downloadFor(ep)}
              onDownload={() => startDownload(ep)}
            />
          ) : undefined
        }
      />
    );
  };
  const pageItems = displayed.slice(safePage * CARD_PAGE, safePage * CARD_PAGE + CARD_PAGE);

  return (
    <section ref={sectionRef} className="flex scroll-mt-4 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>{t("Episodes")}</SectionTitle>
        {seasonItems.length > 1 && (
          <SeasonPicker
            items={seasonItems}
            activeKey={String(season)}
            onPick={(k) => pickSeason(Number(k))}
          />
        )}
      </div>
      {orderOptions.length > 1 && (
        <OrderStyleSwitch options={orderOptions} active={activeOrder} onPick={pickOrder} />
      )}
      <EpisodeToolbar
        layout={layout}
        onLayout={(v) => update({ episodeLayout: v })}
        sort={sort}
        allWatched={allWatched}
        onOpenOptions={() => setSheet("options")}
        searchActive={searchOpen || !!q}
        onToggleSearch={() => {
          if (searchOpen) setQuery("");
          setSearchOpen((v) => !v);
        }}
        onRandom={onRandom}
        onOpenDownloads={canDownload && episodes.length > 0 ? () => setSheet("downloads") : null}
        autoDownload={autoDownload}
      />
      {searchOpen && (
        <EpisodeSearchField
          value={query}
          onChange={setQuery}
          matched={searchResults ? searchResults.length : null}
        />
      )}

      {searchResults ? (
        searchResults.length === 0 ? (
          <p className="py-6 text-center text-[13.5px] text-ink-subtle">
            {t('No episodes match "{q}"', { q: query.trim() })}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">{searchResults.slice(0, 120).map(row)}</div>
        )
      ) : loadingEps && episodes.length === 0 ? (
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <EpisodeSkeleton key={i} />
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-[13.5px] text-ink-subtle">{t("No episodes to show here yet.")}</p>
      ) : layout === "list" ? (
        <>
          <div className="flex flex-col gap-1.5">{displayed.slice(0, renderCount).map(row)}</div>
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
        </>
      ) : layout === "strip" ? (
        <>
          <div
            className={`-mx-5 flex snap-x snap-proximity gap-3 overflow-x-auto px-5 pb-1 ${HIDE_SCROLL}`}
          >
            {pageItems.map((ep) => card(ep, "w-[236px] shrink-0 snap-start"))}
          </div>
          <EpisodePager
            page={safePage}
            pageCount={pageCount}
            total={displayed.length}
            pageSize={CARD_PAGE}
            onChange={changePage}
          />
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            {pageItems.map((ep) => card(ep, "min-w-0"))}
          </div>
          <EpisodePager
            page={safePage}
            pageCount={pageCount}
            total={displayed.length}
            pageSize={CARD_PAGE}
            onChange={changePage}
          />
        </>
      )}

      {!searchResults && displayed.length >= 12 && (
        <GoToEpisode max={maxEpisode} onGo={goToEpisode} />
      )}

      {sheet === "options" && (
        <EpisodeOptionsSheet
          sort={sort}
          onSort={(s) => update({ episodeSort: s })}
          allWatched={allWatched}
          onMarkSeason={markSeason}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === "downloads" && (
        <EpisodeDownloadsSheet
          meta={meta}
          pending={pending.length}
          onDownloadSeason={() => {
            const first = pending[0];
            if (!first) return;
            openPicker(meta, first, { intent: "download", seasonEpisodes: pending });
          }}
          onClose={() => setSheet(null)}
        />
      )}
    </section>
  );
}

/**
 * Per-episode offline control. Idle starts the download picker, as before; a
 * download in flight or one that failed opens a sheet with the desktop menu's
 * cancel and retry, so the button is never a dead tap.
 */
function EpisodeDownloadControl({
  ep,
  item,
  onDownload,
}: {
  ep: Ep;
  item?: DownloadItem;
  onDownload: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const status = item?.status;
  const downloading = status === "downloading";
  const paused = status === "paused";
  const done = status === "done";
  const failed = status === "error" || status === "interrupted";
  const pct = Math.round((item?.ratio ?? 0) * 100);
  const label = done
    ? t("Saved offline")
    : paused
      ? t("Download paused")
      : downloading
        ? t("Downloading {pct}%", { pct })
        : failed
          ? t("Retry download")
          : t("Download for offline");
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={() => {
          if (done) return;
          if (downloading || paused || failed) setOpen(true);
          else onDownload();
        }}
        className="no-press flex h-11 w-11 items-center justify-center rounded-xl text-ink-subtle transition-[color,background-color,transform] duration-150 active:scale-[0.92] active:bg-ink/10 motion-reduce:transition-none"
      >
        {done ? (
          <Check size={18} strokeWidth={2.6} className="text-accent" />
        ) : paused ? (
          <Pause size={17} strokeWidth={2.4} className="text-accent" />
        ) : downloading ? (
          <Loader2 size={18} className="animate-spin text-accent" />
        ) : failed ? (
          <RotateCw size={17} strokeWidth={2.2} className="text-danger" />
        ) : (
          <Download size={18} strokeWidth={2} />
        )}
      </button>
      {open && item && (
        <PhoneSheet
          title={ep.name || t("Episode {number}", { number: ep.episode })}
          onClose={() => setOpen(false)}
        >
          <DownloadStateBody item={item} label={label} onRetry={onDownload} />
        </PhoneSheet>
      )}
    </>
  );
}

function DownloadStateBody({
  item,
  label,
  onRetry,
}: {
  item: DownloadItem;
  label: string;
  onRetry: () => void;
}) {
  const t = useT();
  const close = useSheetClose();
  const failed = item.status === "error" || item.status === "interrupted";
  return (
    <div className="flex flex-col px-3 pb-1">
      <p className="px-3 pb-2 text-[13px] text-ink-subtle">{label}</p>
      {failed ? (
        <SheetRow
          icon={<RotateCw size={19} strokeWidth={2.2} />}
          label={t("Retry download")}
          onClick={() => {
            onRetry();
            close();
          }}
        />
      ) : (
        <SheetRow
          icon={<X size={19} strokeWidth={2.4} className="text-danger" />}
          label={t("Cancel download")}
          onClick={() => {
            cancelDownload(item.id);
            close();
          }}
        />
      )}
    </div>
  );
}
