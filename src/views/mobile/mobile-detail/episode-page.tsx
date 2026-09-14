import { useEffect, useMemo, useState } from "react";
import { Play } from "@/components/icons/play-filled";
import { Poster } from "@/components/poster";
import type { Meta } from "@/lib/cinemeta";
import { fetchEpisodeData } from "@/lib/episode-data-fetcher";
import type { EpisodeDetail } from "@/lib/providers/tmdb/tmdb-episode-types";
import { harborImdbEpisodes } from "@/lib/providers/harbor-imdb";
import { omdbScores, useOmdbScores } from "@/lib/providers/omdb";
import { useTmdbImdbId } from "@/lib/providers/tmdb";
import { useSettings, type Settings } from "@/lib/settings";
import { stremioIdToTraktTarget } from "@/lib/trakt/ids";
import { useT } from "@/lib/i18n";
import { openUrl } from "@/lib/window";
import { HeroRatings } from "@/views/detail/hero-ratings";
import { HIDE_SCROLL, type Ep } from "./data";
import { PhonePage } from "./sheets";
import { Line, Overview, SectionTitle } from "./ui";
import { PhoneLightbox } from "./gallery";
import { TraktCommentsPhone } from "./comments";

function imageUrl(path: string | null | undefined, size: string): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  return `https://image.tmdb.org/t/p/${size}${path}`;
}

/**
 * The desktop episode page (episode-detail.tsx) as a pushed phone page: still,
 * ratings, play, synopsis, guest stars, stills and the episode's Trakt thread.
 * Artwork honors the same spoiler blur desktop does.
 */
export function EpisodePage({
  seriesMeta,
  season,
  episode,
  onBack,
  onPlay,
  onPerson,
}: {
  seriesMeta: Meta;
  season: number;
  episode: number;
  onBack: () => void;
  onPlay: (ep: Ep) => void;
  onPerson: (id: number, name: string) => void;
}) {
  const t = useT();
  const { settings } = useSettings();
  const [data, setData] = useState<EpisodeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  const resolvedImdb = useTmdbImdbId(seriesMeta.id);
  const imdbId = resolvedImdb ?? (seriesMeta.id.startsWith("tt") ? seriesMeta.id : null);
  const seriesScores = useOmdbScores(imdbId ?? undefined);
  const episodeImdbId = data?.imdbId ?? undefined;
  const episodeScores = useOmdbScores(episodeImdbId);
  const [harborRating, setHarborRating] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    setData(null);
    fetchEpisodeData(seriesMeta.id, seriesMeta, season, episode, { tmdbKey: settings.tmdbKey } as Settings)
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setError(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // The series meta identity is the id; its object is rebuilt on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seriesMeta.id, season, episode, settings.tmdbKey]);

  useEffect(() => {
    setHarborRating(undefined);
    if (!imdbId || !imdbId.startsWith("tt")) return;
    let cancelled = false;
    harborImdbEpisodes(imdbId)
      .then((map) => {
        const r = map.get(`${season}:${episode}`);
        if (!cancelled && r != null) setHarborRating(r.toFixed(1));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [imdbId, season, episode]);

  // useOmdbScores only watches the cache, so the episode's own figure has to be asked for.
  useEffect(() => {
    if (!settings.omdbKey || !episodeImdbId) return;
    void omdbScores(settings.omdbKey, episodeImdbId).catch(() => null);
  }, [settings.omdbKey, episodeImdbId]);

  const traktResolution = useMemo(() => {
    const resolution = stremioIdToTraktTarget(seriesMeta.id, { season, episode });
    if (resolution.ok && resolution.target.kind === "episode") {
      const target = resolution.target;
      if (imdbId && !target.show.ids.imdb) target.show.ids.imdb = imdbId;
      const epIds: { tmdb?: number; imdb?: string } = {};
      if (data?.id) epIds.tmdb = data.id;
      if (imdbId) epIds.imdb = imdbId;
      (target as { ids?: { tmdb?: number; imdb?: string } }).ids = epIds;
    }
    return resolution;
  }, [seriesMeta.id, season, episode, imdbId, data?.id]);

  const artworkHidden = settings.hideSpoilers && settings.blurEpisodes && !revealed;
  const still = imageUrl(data?.stillPath, "w780") ?? seriesMeta.background;
  const rating =
    harborRating ??
    episodeScores?.imdbRating ??
    (data?.voteAverage && data.voteAverage > 0 ? data.voteAverage.toFixed(1) : undefined) ??
    seriesScores?.imdbRating;
  const stills = (data?.stills ?? []).slice(0, 12).map((s) => imageUrl(s.filePath, "w780")!).filter(Boolean);

  const play = () => {
    if (!data) {
      onPlay({ season, episode });
      return;
    }
    onPlay({
      season: data.seasonNumber,
      episode: data.episodeNumber,
      name: data.name,
      still: imageUrl(data.stillPath, "w300"),
      overview: data.overview || undefined,
      runtime: data.runtime ?? undefined,
    });
  };

  return (
    <PhonePage
      title={seriesMeta.name}
      eyebrow={t("S{season} E{episode}", { season, episode })}
      onBack={onBack}
    >
      <div className="flex flex-col gap-6 px-5 pt-1">
        <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-surface ring-1 ring-edge-soft/60">
          {still && (
            <img
              src={still}
              alt=""
              className={`h-full w-full object-cover ${artworkHidden ? "scale-105 blur-[24px]" : ""}`}
            />
          )}
          {artworkHidden && data && (
            <button
              type="button"
              onClick={() => setRevealed(true)}
              className="absolute inset-0 flex items-center justify-center"
            >
              <span className="flex h-11 items-center rounded-full bg-canvas/85 px-4 text-[13.5px] font-semibold text-ink">
                {t("Reveal episode artwork")}
              </span>
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-2.5">
            <Line className="w-2/3" />
            <Line className="w-1/3" />
            <Line className="w-full" />
          </div>
        ) : error || !data ? (
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-[24px] font-medium text-ink">{t("Episode Not Found")}</h2>
            <p className="text-[14px] text-ink-muted">{t("Episode information is not available")}</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              <h2 className="font-display text-[26px] font-medium leading-[1.08] tracking-tight text-ink">
                {data.name || t("Episode {number}", { number: data.episodeNumber })}
              </h2>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink-muted">
                {data.airDate && (
                  <span>{t("Aired {date}", { date: new Date(data.airDate).toLocaleDateString() })}</span>
                )}
                {data.airDate && data.runtime ? <span aria-hidden className="text-ink-subtle/40">·</span> : null}
                {data.runtime ? <span>{t("{n} min", { n: data.runtime })}</span> : null}
              </div>
              <div className="empty:hidden [&_button]:-my-[13px] [&_button]:min-h-11">
                <HeroRatings
                  compact
                  bare
                  rating={rating}
                  isAnime={false}
                  scores={episodeScores ?? seriesScores}
                  mdblist={null}
                  imdbId={episodeImdbId ?? imdbId}
                  mediaType="show"
                  onOpenUrl={openUrl}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={play}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-ink text-[15.5px] font-semibold text-canvas"
            >
              <Play size={18} strokeWidth={0} fill="currentColor" />
              {t("Play Episode")}
            </button>

            {data.overview && <Overview text={data.overview} />}

            {data.guestStars.length > 0 && (
              <section className="flex flex-col gap-3.5">
                <SectionTitle>{t("Guest Stars · {n}", { n: data.guestStars.length })}</SectionTitle>
                <div className={`-mx-5 flex snap-x snap-proximity gap-3.5 overflow-x-auto px-5 ${HIDE_SCROLL}`}>
                  {data.guestStars.map((g, i) => {
                    const linkable = g.id > 0;
                    return (
                      <button
                        key={`${g.id}-${i}`}
                        type="button"
                        disabled={!linkable}
                        onClick={() => onPerson(g.id, g.name)}
                        className="flex w-[88px] shrink-0 snap-start flex-col gap-2 text-start"
                      >
                        <Poster
                          src={imageUrl(g.profilePath, "w185")}
                          seed={String(g.id)}
                          ratio="portrait"
                          lazy
                          className="rounded-xl"
                        />
                        <span className="flex flex-col gap-0.5">
                          <span className="line-clamp-1 text-[12.5px] font-medium text-ink">{g.name}</span>
                          {g.character && (
                            <span className="line-clamp-1 text-[11.5px] leading-tight text-ink-subtle">
                              {g.character}
                            </span>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {stills.length > 0 && (
              <section className="flex flex-col gap-3.5">
                <SectionTitle>{t("Stills")}</SectionTitle>
                <div className="grid grid-cols-2 gap-2.5">
                  {stills.map((src, idx) => (
                    <button
                      key={src}
                      type="button"
                      onClick={() => setLightbox(idx)}
                      aria-label={t("Still {n}", { n: idx + 1 })}
                      className="relative aspect-video overflow-hidden rounded-xl bg-surface"
                    >
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className={`h-full w-full object-cover ${artworkHidden ? "scale-105 blur-[24px]" : ""}`}
                      />
                    </button>
                  ))}
                </div>
              </section>
            )}

            {settings.showTraktComments === true && <TraktCommentsPhone resolution={traktResolution} />}
          </>
        )}
      </div>
      {lightbox != null && (
        <PhoneLightbox images={stills} index={lightbox} kind="stills" onClose={() => setLightbox(null)} />
      )}
    </PhonePage>
  );
}
