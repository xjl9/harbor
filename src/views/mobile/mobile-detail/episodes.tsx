import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Meta } from "@/lib/cinemeta";
import { tmdbSeasonEpisodes, type Episode, type TmdbDetail } from "@/lib/providers/tmdb";
import { seasonDateRange } from "@/lib/providers/tvdb-order";
import { useEpisodeOrder } from "@/views/detail/series-episodes/use-episode-order";
import { useEpisodeEnrich } from "@/views/detail/series-episodes/use-episode-enrich";
import { useSeriesTvdbStills } from "@/views/detail/series-episodes/use-series-tvdb-stills";
import { useTvdbSeasonTypes } from "@/views/detail/series-episodes/use-tvdb-season-types";
import { useWatchedSets } from "@/views/detail/series-episodes/use-watched-sets";
import { useSettings } from "@/lib/settings";
import { effectiveOrderProvider } from "@/lib/settings/episode-order";
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
import { useMobileRemote } from "../mobile-remote";
import { stillFrom, tmdbTvId, useEpisodeWindow, type Ep } from "./data";
import { SectionTitle } from "./ui";
import { EpisodeItem, EpisodeSkeleton } from "./episode-item";
import { OrderStyleSwitch, type OrderOption } from "./order-switch";
import { SeasonPicker, type SeasonSheetItem } from "./season-sheet";

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
}: {
  meta: Meta;
  full: Meta | null;
  detail: TmdbDetail | null;
  tmdbKey: string;
  seasons: number[];
  onPlay: (ep: Ep) => void;
}) {
  const { settings } = useSettings();
  const { snapshot } = useMobileRemote();
  const tvdbKey = settings.tvdbKey || snapshot.tvdbKey || "";
  const imdbId = detail?.imdbId ?? (meta.id.startsWith("tt") ? meta.id : null);

  const settingsProvider = effectiveOrderProvider(settings);
  const [override, setOverride] = useState<{ provider: "default" | "tvdb"; seasonType: string } | null>(null);
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
        const label = s.name && s.name.trim() ? s.name : `Season ${s.seasonNumber}`;
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
      const label = s?.name && s.name.trim() ? s.name : `Season ${n}`;
      return {
        key: String(n),
        name: label,
        count: s?.episodeCount,
        year: s?.airDate?.slice(0, 4),
        badge: seasonTypeBadge(n, label),
      };
    });
  }, [ordering, seasons, detail?.seasons]);

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
  });

  const baseEpisodes = useMemo<Ep[]>(() => {
    if (ordering) {
      return (ordering.bySeason.get(season) ?? []).map((e) => ({
        season: e.seasonNumber,
        episode: e.episodeNumber,
        name: e.name || undefined,
        still: stillFrom(e.stillPath, e.stillUrl),
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

  const { renderCount, hasMore, sentinelRef } = useEpisodeWindow(
    episodes.length,
    `${meta.id}|${season}|${effProvider}|${effSeasonType}`,
  );

  if (seasonItems.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Episodes</SectionTitle>
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
      {loadingEps && episodes.length === 0 ? (
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <EpisodeSkeleton key={i} />
          ))}
        </div>
      ) : episodes.length === 0 ? (
        <p className="text-[13.5px] text-ink-subtle">No episodes to show here yet.</p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            {episodes.slice(0, renderCount).map((ep) => {
              const key = `${ep.season}:${ep.episode}`;
              const progress = progressByKey.get(key) ?? { ratio: 0, watched: false, startedAt: 0 };
              return (
                <EpisodeItem
                  key={key}
                  ep={ep}
                  onPlay={onPlay}
                  progress={progress}
                  spoiler={spoilerMaskFor(settings, {
                    watched: progress.watched,
                    isNextUp: key === nextUpKey,
                  })}
                  nextUp={key === nextUpKey}
                  showRating={settings.showEpisodeRating}
                />
              );
            })}
          </div>
          {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
        </>
      )}
    </section>
  );
}
