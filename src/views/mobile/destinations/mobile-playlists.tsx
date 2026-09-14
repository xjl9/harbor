import { Film, Tv } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { PlaylistVodIcon } from "@/components/icons/playlist-vod-icon";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { useT } from "@/lib/i18n";
import { normalizeArabic } from "@/lib/iptv/rtl";
import { getCachedPlaylist } from "@/lib/iptv/store";
import type { IptvPlaylistSource } from "@/lib/iptv/types";
import { buildVodLibrary, type VodEpisode, type VodMovie, type VodSeries } from "@/lib/iptv/vod";
import { credsFromServer } from "@/lib/iptv/xtream";
import { fetchXtreamSeriesEpisodes } from "@/lib/iptv/xtream-vod";
import { useView } from "@/lib/view";
import { useIptvPlaylist } from "@/views/live/hooks/use-iptv-playlist";
import { EpisodeRow } from "@/views/playlist-vod/episode-row";
import { useVodSources } from "@/views/playlist-vod/use-vod-sources";
import { useXtreamVodLibrary } from "@/views/playlist-vod/use-xtream-vod-library";
import { VodCard } from "@/views/playlist-vod/vod-card";
import {
  Chip,
  ChipRow,
  DestinationPage,
  EmptyBlock,
  LoadMoreSentinel,
  PrimaryButton,
  SearchField,
  Segmented,
  SubPage,
} from "./page-shell";
import { ConnectIntro, SourceButton, SourceSheet } from "./playlist-connect";

type Tab = "movies" | "series";
const PAGE_SIZE = 60;

// Same data path as the desktop Playlists view (M3U parsed on-device, Xtream
// catalogs streamed in batches and cached), rendered as a three-up poster grid.
export function MobilePlaylists({ onBack }: { onBack: () => void }) {
  const t = useT();
  const { openPlayer } = useView();
  const { sources, activeId, selectId, addPlaylist, editPlaylist, removePlaylist } = useVodSources();
  const activeSource = useMemo<IptvPlaylistSource | null>(
    () => sources.find((s) => s.id === activeId) ?? null,
    [sources, activeId],
  );
  const isXtream = activeSource?.kind === "xtream";
  const { state, refresh: refreshPlaylist } = useIptvPlaylist(!isXtream ? activeSource : null);
  const xtream = useXtreamVodLibrary(isXtream ? activeSource : null);
  const refresh = isXtream ? xtream.refresh : refreshPlaylist;
  const playlist = state.kind === "ready" ? state.playlist : getCachedPlaylist(activeSource?.id ?? "");

  const names = useMemo(() => new Map(sources.map((s) => [s.id, s.name] as const)), [sources]);
  const library = useMemo(() => {
    if (isXtream) return xtream.library;
    return playlist ? buildVodLibrary([playlist], names) : { movies: [], series: [] };
  }, [isXtream, names, playlist, xtream.library]);
  const loading = isXtream ? xtream.loading : state.kind === "loading";
  const error = isXtream ? xtream.error : state.kind === "error" ? state.message : null;
  const fetchedAt = isXtream ? xtream.fetchedAt : (playlist?.fetchedAt ?? null);

  const [tab, setTab] = useState<Tab>("movies");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VodSeries | null>(null);
  const [loadingSeriesId, setLoadingSeriesId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const viewError = isXtream ? (tab === "movies" ? xtream.movieError : xtream.seriesError) : error;
  const tabLoading = isXtream ? (tab === "movies" ? xtream.moviesLoading : xtream.seriesLoading) : loading;
  const providerTotal = isXtream ? (tab === "movies" ? xtream.movieTotal : xtream.seriesTotal) : null;
  const tabItemCount = tab === "movies" ? library.movies.length : library.series.length;

  useEffect(() => {
    setSelected(null);
    setVisibleCount(PAGE_SIZE);
  }, [activeId]);
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [query, tab]);

  const deferredQuery = useDeferredValue(query);
  const q = useMemo(() => normalizeArabic(deferredQuery), [deferredQuery]);
  const movieIndex = useMemo(() => library.movies.map((m) => normalizeArabic(m.title)), [library.movies]);
  const seriesIndex = useMemo(() => library.series.map((s) => normalizeArabic(s.title)), [library.series]);
  const movies = useMemo(
    () => (q ? library.movies.filter((_, i) => movieIndex[i].includes(q)) : library.movies),
    [library.movies, movieIndex, q],
  );
  const series = useMemo(
    () => (q ? library.series.filter((_, i) => seriesIndex[i].includes(q)) : library.series),
    [library.series, seriesIndex, q],
  );
  const total = tab === "movies" ? movies.length : series.length;
  const loadMore = useCallback(() => {
    setVisibleCount((count) => Math.min(count + PAGE_SIZE, total));
  }, [total]);

  const playMovie = useCallback(
    (m: VodMovie) => {
      openPlayer({
        meta: vodMeta(m.id, "movie", m.title, m.logo, m.year),
        url: m.url,
        title: m.title,
        subtitle: m.year ? String(m.year) : m.playlistName,
        notWebReady: true,
      });
    },
    [openPlayer],
  );
  const playEpisode = useCallback(
    (s: VodSeries, ep: VodEpisode) => {
      openPlayer({
        meta: vodMeta(s.id, "series", s.title, s.logo, null),
        episode: { season: ep.season, episode: ep.episode, name: ep.title },
        url: ep.url,
        title: ep.title,
        subtitle: `${s.title} · S${ep.season} · E${ep.episode}`,
        notWebReady: true,
      });
    },
    [openPlayer],
  );

  const openSeries = useCallback(
    (item: VodSeries) => {
      setSelected(item);
      if (!item.xtreamSeriesId || activeSource?.kind !== "xtream" || !activeSource.xtream) return;
      const creds = credsFromServer(
        activeSource.xtream.server,
        activeSource.xtream.username,
        activeSource.xtream.password,
      );
      if (!creds) return;
      setLoadingSeriesId(item.id);
      void fetchXtreamSeriesEpisodes(creds, activeSource.id, {
        series_id: Number(item.xtreamSeriesId),
        name: item.title,
        cover: item.logo ?? undefined,
        category_id: item.group ?? undefined,
      })
        .then((channels) => {
          const episodes = channels.map((channel) => {
            const match = /S(\d+)E(\d+)$/i.exec(channel.name);
            return {
              season: Number(match?.[1]) || 1,
              episode: Number(match?.[2]) || 0,
              title: channel.attrs["episode-title"] || channel.name,
              url: channel.url,
              logo: channel.logo,
              durationSec: channel.durationSec,
              plot: channel.attrs["episode-plot"] || null,
            };
          });
          const seasons = [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b);
          setSelected((cur) => (cur?.id === item.id ? { ...cur, episodes, seasons } : cur));
        })
        .catch(() => {})
        .finally(() => setLoadingSeriesId((cur) => (cur === item.id ? null : cur)));
    },
    [activeSource],
  );

  const sheet = sourcesOpen && (
    <SourceSheet
      sources={sources}
      activeId={activeId}
      fetchedAt={fetchedAt}
      loading={loading}
      onClose={() => setSourcesOpen(false)}
      onSelect={selectId}
      onAdd={addPlaylist}
      onEdit={editPlaylist}
      onRemove={removePlaylist}
      onRefresh={refresh}
    />
  );

  if (sources.length === 0) {
    return (
      <DestinationPage kicker={t("Live TV")} title={t("Playlists")} icon={<PlaylistVodIcon />} onBack={onBack}>
        <ConnectIntro kicker={t("Playlists")} onSave={addPlaylist} />
      </DestinationPage>
    );
  }

  const visibleMovies = movies.slice(0, visibleCount);
  const visibleSeries = series.slice(0, visibleCount);

  return (
    <DestinationPage
      kicker={t("Live TV")}
      title={t("Playlists")}
      icon={<PlaylistVodIcon />}
      onBack={onBack}
      actions={<SourceButton source={activeSource} count={null} onClick={() => setSourcesOpen(true)} />}
    >
      <div className="flex flex-col gap-2.5 pb-5">
        <Segmented<Tab>
          value={tab}
          onChange={(next) => {
            setTab(next);
            setSelected(null);
          }}
          options={[
            { id: "movies", label: t("Movies"), icon: <Film size={14} strokeWidth={2} />, count: library.movies.length },
            { id: "series", label: t("Shows"), icon: <Tv size={14} strokeWidth={2} />, count: library.series.length },
          ]}
        />
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={tab === "movies" ? t("Search movies") : t("Search shows")}
        />
      </div>

      {viewError && tabItemCount === 0 ? (
        <EmptyBlock
          title={t("Couldn't load this playlist")}
          body={viewError}
          tone="danger"
          action={<PrimaryButton onClick={refresh}>{t("Try again")}</PrimaryButton>}
        />
      ) : tabLoading && (tab === "movies" ? movies.length === 0 : series.length === 0) ? (
        <EmptyBlock title={t("Loading playlist...")} />
      ) : tab === "movies" ? (
        movies.length === 0 ? (
          <EmptyBlock title={emptyMoviesText(t, library.movies.length, q)} />
        ) : (
          <>
            {viewError && <Warning text={viewError} onRetry={refresh} />}
            <Progress loading={tabLoading} loaded={library.movies.length} total={providerTotal} kind="movies" />
            <div className="grid grid-cols-3 gap-x-3 gap-y-5">
              {visibleMovies.map((m) => (
                <VodCard
                  key={m.id}
                  kind="movie"
                  title={m.title}
                  year={m.year}
                  logo={m.logo}
                  seed={m.title}
                  onClick={() => playMovie(m)}
                />
              ))}
            </div>
            {visibleMovies.length < movies.length && <LoadMoreSentinel onLoadMore={loadMore} />}
          </>
        )
      ) : series.length === 0 ? (
        <EmptyBlock title={emptyShowsText(t, library.series.length, q)} />
      ) : (
        <>
          {viewError && <Warning text={viewError} onRetry={refresh} />}
          <Progress loading={tabLoading} loaded={library.series.length} total={providerTotal} kind="shows" />
          <div className="grid grid-cols-3 gap-x-3 gap-y-5">
            {visibleSeries.map((s) => (
              <VodCard
                key={s.id}
                kind="series"
                title={s.title}
                year={null}
                logo={s.logo}
                seed={s.title}
                subtitle={
                  s.xtreamSeriesId
                    ? (s.group ?? t("Open to load episodes"))
                    : s.episodes.length === 1
                      ? t("{n} episode", { n: 1 })
                      : t("{n} episodes", { n: s.episodes.length })
                }
                onClick={() => openSeries(s)}
              />
            ))}
          </div>
          {visibleSeries.length < series.length && <LoadMoreSentinel onLoadMore={loadMore} />}
        </>
      )}

      {selected && (
        <SeriesPage
          key={`${selected.id}:${selected.seasons.join(",")}`}
          series={selected}
          loading={loadingSeriesId === selected.id}
          onBack={() => setSelected(null)}
          onPlay={(ep) => playEpisode(selected, ep)}
        />
      )}
      {sheet}
    </DestinationPage>
  );
}

function SeriesPage({
  series,
  loading,
  onBack,
  onPlay,
}: {
  series: VodSeries;
  loading: boolean;
  onBack: () => void;
  onPlay: (ep: VodEpisode) => void;
}) {
  const t = useT();
  const [season, setSeason] = useState<number>(series.seasons[0] ?? 1);
  const episodes = series.episodes.filter((e) => e.season === season);
  const count = loading
    ? t("Loading episodes...")
    : series.episodes.length === 1
      ? t("{n} episode", { n: 1 })
      : t("{n} episodes", { n: series.episodes.length });
  return (
    <SubPage title={series.title} kicker={series.group ?? t("Shows")} onBack={onBack}>
      <div className="flex items-start gap-4 pb-5">
        <div className="w-24 shrink-0 overflow-hidden rounded-lg ring-1 ring-edge-soft/60">
          <Poster src={series.logo ?? undefined} seed={series.title} className="w-full" />
        </div>
        <div className="min-w-0 pt-1">
          <h2 className="font-display text-[22px] font-medium leading-tight tracking-tight text-ink">{series.title}</h2>
          <p className="mt-1.5 text-[13px] text-ink-muted">
            {count}
            {series.seasons.length > 1 ? ` · ${t("{n} seasons", { n: series.seasons.length })}` : ""}
          </p>
        </div>
      </div>
      {series.seasons.length > 1 && (
        <ChipRow className="pb-3">
          {series.seasons.map((s) => (
            <Chip key={s} label={t("Season {n}", { n: s })} active={season === s} onClick={() => setSeason(s)} />
          ))}
        </ChipRow>
      )}
      <div className="-mx-2 flex flex-col gap-1">
        {loading ? (
          <p className="px-3 py-4 text-[14px] text-ink-muted">{t("Loading episodes...")}</p>
        ) : episodes.length === 0 ? (
          <p className="px-3 py-4 text-[14px] text-ink-muted">{t("No episodes in this season.")}</p>
        ) : (
          episodes.map((ep) => (
            <EpisodeRow
              key={`${ep.season}-${ep.episode}`}
              seriesId={series.id}
              ep={ep}
              fallbackLogo={series.logo}
              onPlay={() => onPlay(ep)}
            />
          ))
        )}
      </div>
    </SubPage>
  );
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

function emptyMoviesText(t: Translate, total: number, query: string): string {
  if (query) return t('No movies match "{query}".', { query });
  if (total === 0)
    return t("This playlist has no movies. It may be live channels only, or an Xtream login that exposes movies separately.");
  return t("No movies here.");
}

function emptyShowsText(t: Translate, total: number, query: string): string {
  if (query) return t('No shows match "{query}".', { query });
  if (total === 0)
    return t("This playlist has no shows. It may be live channels only, or an Xtream login that exposes shows separately.");
  return t("No shows here.");
}

function vodMeta(id: string, type: "movie" | "series", name: string, logo: string | null, year: number | null): Meta {
  return {
    id,
    type,
    name,
    poster: logo ?? undefined,
    background: logo ?? undefined,
    releaseInfo: year ? String(year) : undefined,
  };
}

function Progress({
  loading,
  loaded,
  total,
  kind,
}: {
  loading: boolean;
  loaded: number;
  total: number | null;
  kind: "movies" | "shows";
}) {
  const t = useT();
  if (!loading) return null;
  const label =
    total == null
      ? kind === "movies"
        ? t("Loading movies...")
        : t("Loading shows...")
      : kind === "movies"
        ? t("Loaded {loaded} of {total} movies...", {
            loaded: loaded.toLocaleString(),
            total: Math.max(total, loaded).toLocaleString(),
          })
        : t("Loaded {loaded} of {total} shows...", {
            loaded: loaded.toLocaleString(),
            total: Math.max(total, loaded).toLocaleString(),
          });
  return <p className="mb-4 text-[12.5px] tabular-nums text-ink-subtle">{label}</p>;
}

function Warning({ text, onRetry }: { text: string; onRetry: () => void }) {
  const t = useT();
  return (
    <div className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-edge-soft bg-elevated px-4 py-3">
      <p className="min-w-0 text-[12.5px] text-ink-muted">{text}</p>
      <button type="button" onClick={onRetry} className="h-11 shrink-0 text-[12.5px] font-semibold text-ink">
        {t("Try again")}
      </button>
    </div>
  );
}
