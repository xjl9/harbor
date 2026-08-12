import { useMemo, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import type { Meta } from "@/lib/cinemeta";
import { Poster } from "@/components/poster";
import { formatAirDate } from "@/lib/dates";
import { parseKitsuId, type KitsuEpisode } from "@/lib/providers/kitsu";
import { pickTvdbImage } from "@/lib/providers/tvdb-proxy";
import type { PlayEpisode } from "@/lib/view";
import { useSettings } from "@/lib/settings";
import { effectiveOrderProvider, tvdbPanelEnabled } from "@/lib/settings/episode-order";
import { formatRelativeWatched, type EpisodeProgress } from "@/lib/episode-progress";
import { manualWatchedVersion, subscribeManualWatched } from "@/lib/manual-watched";
import { SPOILER_TEXT_CLASS, SPOILER_THUMB_CLASS, type SpoilerMask } from "@/lib/spoilers";
import { useTrakt } from "@/lib/trakt/provider";
import { useAnilistWatched } from "@/lib/anilist/use-anilist-watched";
import { useMalWatched } from "@/lib/mal/use-mal-watched";
import { useWatchedSets } from "@/views/detail/series-episodes/use-watched-sets";
import { useAnimeOrder } from "@/views/detail/anime-episodes/use-anime-order";
import { useAnimeTvdbPanel } from "@/views/detail/anime-episodes/use-anime-tvdb-panel";
import { useAnimePreferredSeason } from "@/views/detail/anime-episodes/use-anime-preferred-season";
import { useAnimeProgressMap } from "@/views/detail/anime-episodes/use-anime-progress-map";
import { useTvdbProxyImages } from "@/views/detail/anime-episodes/use-tvdb-proxy-images";
import { useT } from "@/lib/i18n";
import { useMobileRemote } from "../mobile-remote";
import { useEpisodeWindow } from "./data";
import { EpisodeRating, SectionTitle } from "./ui";
import { SeasonPicker, type SeasonSheetItem } from "./season-sheet";
import { animeSeasonKey } from "@/views/detail/anime-episodes/anime-season-key";

function seasonKey(ep: KitsuEpisode): number {
  return ep.seasonNumber && ep.seasonNumber > 0 ? ep.seasonNumber : 1;
}

// Lowest-numbered episode of the earliest season — the "Play" entry point.
export function firstAnimeEpisode(episodes: KitsuEpisode[]): KitsuEpisode | null {
  if (episodes.length === 0) return null;
  return [...episodes].sort(
    (a, b) => seasonKey(a) - seasonKey(b) || a.number - b.number,
  )[0];
}

// Map a Kitsu episode to the rich PlayEpisode the stream pipeline + trackers key
// on. Dropping any of these ids breaks anime stream resolution or scrobbling, so
// this mirrors the desktop episode-row mapping exactly.
export function toPlayEpisode(ep: KitsuEpisode): PlayEpisode {
  return {
    // animeSeasonKey (not the 0-folds-to-1 seasonKey) so playback writes the
    // resume/manual key under the same season the progress overlay reads;
    // seasonKey stays only for firstAnimeEpisode ordering.
    season: animeSeasonKey(ep),
    episode: ep.number,
    name: ep.title,
    still: ep.thumbnail ?? ep.thumbnailFallback ?? undefined,
    overview: ep.synopsis || undefined,
    kitsuStreamId: ep.streamId,
    imdbId: ep.imdbId,
    imdbSeason: ep.imdbSeason,
    imdbEpisode: ep.imdbEpisode,
    absoluteNumber: ep.absoluteNumber ?? ep.number,
    tvdbEpisodeId: ep.tvdbEpisodeId,
    sourceMetaId: ep.sourceMetaId,
    airDate: ep.airdate ?? undefined,
    runtime: ep.length ?? undefined,
    rating: ep.rating,
  };
}

export function AnimeEpisodeSection({
  meta,
  imdbId,
  episodes,
  loading,
  onPlay,
}: {
  meta: Meta;
  imdbId: string | null;
  episodes: KitsuEpisode[];
  loading: boolean;
  onPlay: (ep: PlayEpisode) => void;
}) {
  const { settings } = useSettings();
  const { snapshot } = useMobileRemote();
  const tvdbKey = settings.tvdbKey || snapshot.tvdbKey || "";
  const kitsuId = parseKitsuId(meta.id);

  const { isConnected: traktConnected } = useTrakt();
  const mwVersion = useSyncExternalStore(subscribeManualWatched, manualWatchedVersion);
  const { traktWatched } = useWatchedSets({
    traktConnected,
    simklConnected: false,
    imdbId,
    metaId: meta.id,
  });
  const { watchedKeys: anilistWatched } = useAnilistWatched(meta.id, episodes);
  const { watchedKeys: malWatched } = useMalWatched(meta.id, episodes);

  const preferredSeasonKey = useAnimePreferredSeason({
    episodes,
    metaId: meta.id,
    traktWatched,
    anilistWatched,
    malWatched,
    mwVersion,
  });

  // Real TVDB season structure when it resolves; raw kitsu seasonNumber
  // grouping stays as the fallback.
  const order = useAnimeOrder(
    imdbId,
    meta.id,
    episodes,
    effectiveOrderProvider(settings),
    settings.tvdbSeasonType,
    tvdbKey,
    preferredSeasonKey ?? undefined,
  );
  const tvdbPanel = useAnimeTvdbPanel(
    kitsuId,
    imdbId,
    episodes,
    settings.tvdbSeasonType,
    tvdbKey,
    tvdbPanelEnabled(settings) && !!tvdbKey,
    undefined,
    preferredSeasonKey ?? undefined,
  );
  const panel = tvdbPanel.panel;

  const fallbackSeasons = useMemo(() => {
    const set = new Set<number>();
    for (const ep of episodes) set.add(seasonKey(ep));
    return [...set].sort((a, b) => a - b);
  }, [episodes]);
  const [fallbackSeason, setFallbackSeason] = useState<number | null>(null);
  const activeFallback = fallbackSeason ?? fallbackSeasons[0] ?? 1;
  const fallbackShown = useMemo(
    () =>
      episodes
        .filter((ep) => seasonKey(ep) === activeFallback)
        .sort((a, b) => a.number - b.number),
    [episodes, activeFallback],
  );

  const baseDisplay = panel ? panel.visibleEpisodes : order ? order.visibleEpisodes : fallbackShown;
  const proxyImages = useTvdbProxyImages(kitsuId, imdbId, episodes.length, settings.tvdbSeasonType);
  const displayEpisodes = useMemo(() => {
    if (Object.keys(proxyImages).length === 0) return baseDisplay;
    return baseDisplay.map((ep) => {
      const img = pickTvdbImage(proxyImages, ep);
      return img ? { ...ep, thumbnail: img } : ep;
    });
  }, [baseDisplay, proxyImages]);

  const { progressFor, nextUpId, spoilerFor } = useAnimeProgressMap({
    episodes,
    displayEpisodes,
    metaId: meta.id,
    traktWatched,
    anilistWatched,
    malWatched,
    mwVersion,
    settings,
  });

  const pickerItems = useMemo<SeasonSheetItem[]>(() => {
    const items = panel?.items ?? order?.items;
    if (items) {
      return items.map((i) => ({
        key: i.key,
        name: i.name,
        count: i.count,
        year: i.year,
        from: i.from,
        to: i.to,
        extra: i.extra,
        badge: i.badge,
      }));
    }
    return fallbackSeasons.map((n) => ({ key: String(n), name: `Season ${n}` }));
  }, [panel?.items, order?.items, fallbackSeasons]);
  const activeKey = panel ? panel.activeKey : order ? order.activeKey : String(activeFallback);
  const onPickSeason = (k: string) => {
    if (panel) panel.onSelect(k);
    else if (order) order.onSelect(k);
    else setFallbackSeason(Number(k));
  };

  // The One Piece case: seasonless Kitsu listings fold 1000+ episodes into
  // season 1, so the list must window instead of mounting every row.
  const { renderCount, hasMore, sentinelRef } = useEpisodeWindow(
    displayEpisodes.length,
    `${meta.id}|${activeKey}|${displayEpisodes.length}`,
  );

  if (loading && episodes.length === 0) {
    return (
      <section className="flex flex-col gap-4">
        <SectionTitle>Episodes</SectionTitle>
        <div className="flex flex-col gap-3.5">
          {[0, 1, 2, 3].map((i) => (
            <EpisodeSkeleton key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (episodes.length === 0) return null;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle>Episodes</SectionTitle>
        {pickerItems.length > 1 && (
          <SeasonPicker items={pickerItems} activeKey={activeKey} onPick={onPickSeason} />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        {displayEpisodes.slice(0, renderCount).map((ep) => (
          <AnimeEpisodeItem
            key={ep.id}
            ep={ep}
            onPlay={onPlay}
            progress={progressFor(ep)}
            spoiler={spoilerFor(ep)}
            nextUp={ep.id === nextUpId}
            showRating={settings.showEpisodeRating}
          />
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} aria-hidden className="h-1" />}
    </section>
  );
}

function AnimeEpisodeItem({
  ep,
  onPlay,
  progress,
  spoiler,
  nextUp,
  showRating,
}: {
  ep: KitsuEpisode;
  onPlay: (ep: PlayEpisode) => void;
  progress: EpisodeProgress;
  spoiler: SpoilerMask;
  nextUp: boolean;
  showRating: boolean;
}) {
  const t = useT();
  const watchedAgo = progress.startedAt > 0 ? formatRelativeWatched(progress.startedAt) : "";
  const sub = [
    `E${ep.number}`,
    ep.absoluteNumber && ep.absoluteNumber !== ep.number ? `Abs ${ep.absoluteNumber}` : null,
    ep.length ? `${ep.length} min` : null,
    formatAirDate(ep.airdate) || null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  return (
    <button
      type="button"
      onClick={() => onPlay(toPlayEpisode(ep))}
      className="group flex gap-3.5 rounded-2xl p-2 text-start transition-colors active:bg-elevated/50 motion-reduce:transition-none"
    >
      <div
        className={`relative w-[128px] shrink-0 overflow-hidden rounded-xl ${
          nextUp ? "ring-1 ring-accent/60" : ""
        }`}
      >
        <div className={spoiler.thumb ? SPOILER_THUMB_CLASS : undefined}>
          <Poster
            src={ep.thumbnail ?? ep.thumbnailFallback ?? undefined}
            seed={`${ep.id}`}
            ratio="landscape"
            lazy="release"
          />
        </div>
        <span className="absolute start-1.5 top-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
          {ep.number}
        </span>
        {progress.watched && (
          <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400/22 text-emerald-200 ring-1 ring-emerald-400/40 backdrop-blur-sm">
            <Check size={11} strokeWidth={3} />
          </span>
        )}
        {showRating && ep.rating != null && ep.rating > 0 && (
          <EpisodeRating value={ep.rating} isImdb={!!ep.ratingIsImdb} />
        )}
        {progress.ratio > 0.01 && (
          <div className="absolute inset-x-0 bottom-0 h-[3px] bg-black/55">
            <div
              className="h-full bg-accent"
              style={{ width: `${Math.max(2, progress.ratio * 100)}%` }}
            />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <div className="flex items-center gap-2">
          <p
            className={`line-clamp-1 min-w-0 text-[14px] font-semibold text-ink ${
              spoiler.title ? SPOILER_TEXT_CLASS : ""
            }`}
          >
            {ep.title || `Episode ${ep.number}`}
          </p>
          {ep.filler && (
            <span className="inline-flex shrink-0 items-center rounded-[5px] border border-edge-soft bg-elevated/40 px-1.5 py-[1px] text-[9px] font-medium uppercase tracking-[0.14em] text-ink-subtle">
              Filler
            </span>
          )}
        </div>
        {sub && (
          <p className="text-[11.5px] text-ink-subtle">
            {sub}
            {progress.watched && watchedAgo && (
              <span className="text-emerald-300/85">
                {"  ·  "}
                {t("Watched {ago}", { ago: watchedAgo })}
              </span>
            )}
            {!progress.watched && progress.ratio > 0.01 && watchedAgo && (
              <span className="text-accent/85">
                {"  ·  "}
                {t("{pct}% watched", { pct: Math.round(progress.ratio * 100) })}
              </span>
            )}
          </p>
        )}
        {ep.synopsis && (
          <p
            className={`line-clamp-2 text-[12px] leading-relaxed text-ink-muted ${
              spoiler.desc ? SPOILER_TEXT_CLASS : ""
            }`}
          >
            {ep.synopsis}
          </p>
        )}
      </div>
    </button>
  );
}

function EpisodeSkeleton() {
  return (
    <div className="flex gap-3.5 p-2">
      <div className="aspect-video w-[128px] shrink-0 animate-pulse rounded-xl bg-elevated/60" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-elevated/60" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-elevated/50" />
      </div>
    </div>
  );
}
